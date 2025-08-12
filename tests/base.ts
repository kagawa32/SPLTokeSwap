import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  Connection
} from "@solana/web3.js";
import { Program, BN } from "@coral-xyz/anchor";
import { SplSwap } from "../target/types/spl_swap";
import {
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  unpackMint,
  unpackAccount,

} from "@solana/spl-token";
import { use } from "chai";

const IDL = require("../target/idl/spl_swap.json");

export class TestBase {
  public client: any;
  public provider: LiteSVMProvider;
  public swapProgram: Program<SplSwap>;
  public payer: Keypair;
  public user0: Keypair;
  public user1: Keypair;
  public token0_mint: Keypair;
  public token1_mint: Keypair;
  public user0_token0_account: PublicKey;
  public user0_token1_account: PublicKey;
  public pool_token0_account: PublicKey;
  public pool_token1_account: PublicKey;
  public amm: PublicKey;
  public pool_pda: PublicKey;
  public mint_lp_pda: PublicKey;

  public user1_token0_account: PublicKey;
  public user1_token1_account: PublicKey;

  constructor() {
    this.client = fromWorkspace(".");
    this.provider = new LiteSVMProvider(this.client);
    this.swapProgram = new Program<SplSwap>(IDL, this.provider);
    
    // Generate keypairs
    this.payer = Keypair.generate();
    this.user0 = Keypair.generate();
    this.user1 = Keypair.generate();
    this.token0_mint = Keypair.generate();
    this.token1_mint = Keypair.generate();

  }

  async initialize(): Promise<void> {
    // Airdrop SOL to accounts
    await this.client.airdrop(this.payer.publicKey, BigInt(2*LAMPORTS_PER_SOL));
    await this.client.airdrop(this.user0.publicKey, BigInt(2*LAMPORTS_PER_SOL));
    await this.client.airdrop(this.user1.publicKey, BigInt(2*LAMPORTS_PER_SOL));
  }

  async create_amm(payer: Keypair): Promise<string> {
    const [admin_pda] = this.get_amm_pda(payer.publicKey);
    this.amm = admin_pda;
    const instruction = await this.swapProgram.methods.createAmm().accountsPartial({
      amm: admin_pda,
      payer: payer.publicKey
    }).instruction();

    // 创建交易并使用 provider.sendAndConfirm
    const transaction = new Transaction().add(instruction);
    const transactionSignature = await this.provider.sendAndConfirm(transaction, [payer]);

    return transactionSignature;
  }

  async create_pool(payer: Keypair, admin: PublicKey):Promise<string> {
    const [pool_pda] = this.get_pool_pda(admin);
    const [mint_LP_pda] = this.get_mint_lp_pda(admin);
    this.mint_lp_pda = mint_LP_pda;
    this.pool_pda = pool_pda;

    const transactionSignature = await this.swapProgram.methods.createPool().accountsPartial({
      admin: payer.publicKey,
      systemProgram: SystemProgram.programId,
      mintA: this.token0_mint.publicKey,
      mintB: this.token1_mint.publicKey,
      amm: this.amm,
      poolAccount: this.pool_pda,
      mintLiquidity: mint_LP_pda,
      tokenProgram: TOKEN_PROGRAM_ID,
    }).signers([payer]).rpc();
    return transactionSignature;
  }

  async create_pool_token(): Promise<string>{
    const pool_token0_account = getAssociatedTokenAddressSync(
        this.token0_mint.publicKey,
        this.pool_pda,
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const pool_token1_account = getAssociatedTokenAddressSync(
        this.token1_mint.publicKey,
        this.pool_pda,
        true, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
    this.pool_token0_account = pool_token0_account;
    this.pool_token1_account = pool_token1_account;

    const transactionSignature = await this.swapProgram.methods.createPoolToken().accountsPartial(
      {
        payer: this.payer.publicKey,
        systemProgram: SystemProgram.programId,
        mintA: this.token0_mint.publicKey,
        mintB: this.token1_mint.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        amm: this.amm,
        poolAccount: this.pool_pda,
        poolAccountA: pool_token0_account,
        poolAccountB: pool_token1_account,
      }
    ).signers([this.payer]).rpc()
    return transactionSignature;
  }

  get_depositor_lp_account(depositor:Keypair): PublicKey{
    return getAssociatedTokenAddressSync(
        this.mint_lp_pda,
        depositor.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }

  async add_liquidity(depositor: Keypair, amount_a: BN, amount_b: BN, min_amount_a: BN, min_amount_b: BN): Promise<string>{

    const depositor_lp_account = getAssociatedTokenAddressSync(
        this.mint_lp_pda,
        depositor.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const depositorAccountA = getAssociatedTokenAddressSync(
        this.token0_mint.publicKey,
        depositor.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

    const depositorAccountB = getAssociatedTokenAddressSync(
      this.token1_mint.publicKey,
      depositor.publicKey,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );


    // 构建交易指令而不是直接执行
    const instruction = await this.swapProgram.methods.addLiquidity(amount_a, amount_b, min_amount_a, min_amount_b).accountsPartial({

      poolAccount: this.pool_pda,
      depositor: depositor.publicKey,
      mintA: this.token0_mint.publicKey,
      mintB: this.token1_mint.publicKey,
      mintLiquidity: this.mint_lp_pda,
      poolAccountA: this.pool_token0_account,
      poolAccountB: this.pool_token1_account,
      depositorAccountA: depositorAccountA,
      depositorAccountB: depositorAccountB,
      depositorAccountLiquidity: depositor_lp_account,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    }).instruction();

    // 创建交易并使用 provider.sendAndConfirm
    const transaction = new Transaction().add(instruction);
    const transactionSignature = await this.provider.sendAndConfirm(transaction, [depositor]);
    return transactionSignature;
  }

  async remove_liquidity(depositor: Keypair, min_amount_a: BN, min_amount_b: BN, liquidity: BN): Promise<string> {
    const depositor_lp_account = getAssociatedTokenAddressSync(
        this.mint_lp_pda,
        depositor.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const depositorAccountA = getAssociatedTokenAddressSync(
        this.token0_mint.publicKey,
        depositor.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
    
    const depositorAccountB = getAssociatedTokenAddressSync(
      this.token1_mint.publicKey,
      depositor.publicKey,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // 构建交易指令而不是直接执行
    const instruction = await this.swapProgram.methods.removeLiquidity(liquidity, min_amount_a, min_amount_b).accountsPartial({
      poolAccount: this.pool_pda,
      depositor: depositor.publicKey,
      mintA: this.token0_mint.publicKey,
      mintB: this.token1_mint.publicKey, 
      mintLiquidity: this.mint_lp_pda,
      poolAccountA: this.pool_token0_account,
      poolAccountB: this.pool_token1_account,
      depositorAccountA: depositorAccountA,
      depositorAccountB: depositorAccountB,
      depositorAccountLiquidity: depositor_lp_account
    }).instruction();

    // 创建交易并使用 provider.sendAndConfirm
    const transaction = new Transaction().add(instruction);
    const transactionSignature = await this.provider.sendAndConfirm(transaction, [depositor]);
    return transactionSignature;
  }

  async swap(depositor: Keypair, amount: BN, min_output: BN, output_b: boolean): Promise<string> {
    const depositorAccountA = getAssociatedTokenAddressSync(
        this.token0_mint.publicKey,
        depositor.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
    
    const depositorAccountB = getAssociatedTokenAddressSync(
      this.token1_mint.publicKey,
      depositor.publicKey,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // 构建交易指令而不是直接执行
    const instruction = await this.swapProgram.methods.swapExtacttokenFortoken(amount, min_output, output_b).accountsPartial({
      poolAccount: this.pool_pda,
      mintA: this.token0_mint.publicKey,
      mintB: this.token1_mint.publicKey,
      depositor: depositor.publicKey,
      poolAccountA: this.pool_token0_account,
      poolAccountB: this.pool_token1_account,
      depositorAccountA: depositorAccountA,
      depositorAccountB: depositorAccountB
    }).instruction();

    // 创建交易并使用 provider.sendAndConfirm
    const transaction = new Transaction().add(instruction);
    const transactionSignature = await this.provider.sendAndConfirm(transaction, [depositor]);
    return transactionSignature;
    
  }

  async mint_token_to_user(user: Keypair, token: PublicKey ,amount: bigint): Promise<string> {
    const associatedTokenAccount = getAssociatedTokenAddressSync(
        token,
        user.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

    const mintToInstruction = createMintToInstruction(
      token, // mint
      associatedTokenAccount, // destination
      this.payer.publicKey, // authority of mint account
      amount, // amount
      [], // multiSigners
      TOKEN_PROGRAM_ID // programId
    );

    const mintTransaction = new Transaction().add(mintToInstruction);
    const transactionSignature = await this.provider.send(mintTransaction, [this.payer])
    return transactionSignature
  }

  get_mint_lp_pda(admin: PublicKey):[PublicKey, number]{
    return PublicKey.findProgramAddressSync([
      admin.toBuffer(),
      this.token0_mint.publicKey.toBuffer(),
      this.token1_mint.publicKey.toBuffer(),
      Buffer.from("LP_MINT")], this.swapProgram.programId);
  }

  get_pool_pda(admin: PublicKey):[PublicKey, number]{
    return PublicKey.findProgramAddressSync([admin.toBuffer(),
      this.token0_mint.publicKey.toBuffer(),
      this.token1_mint.publicKey.toBuffer(),
      Buffer.from("POOL")], this.swapProgram.programId);
  }

  get_amm_pda(admin: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([admin.toBuffer()], this.swapProgram.programId);
  }

  async setup_user_token():Promise<void>{
    const [user0_token0_sig, user0_token0_account] = await this.CreateUserATA(this.user0, this.token0_mint.publicKey);
    const [user0_token1_sig, user0_token1_account] = await this.CreateUserATA(this.user0, this.token1_mint.publicKey);
    const [user1_token0_sig, user1_token0_account] = await this.CreateUserATA(this.user1, this.token0_mint.publicKey);
    const [user1_token1_sig, user1_token1_account] = await this.CreateUserATA(this.user1, this.token1_mint.publicKey);

    this.user0_token0_account = user0_token0_account;
    this.user0_token1_account = user0_token1_account;
    this.user1_token0_account = user1_token0_account;
    this.user1_token1_account = user1_token1_account;

  }

  async CreateUserATA(user: Keypair, token_mint: PublicKey): Promise<[string, PublicKey]>{
    const associatedTokenAccount = getAssociatedTokenAddressSync(
        token_mint,
        user.publicKey,
        false, // allowOwnerOffCurve
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );

    // Create associated token account instruction
    const createAssociatedTokenAccountIx = createAssociatedTokenAccountInstruction(
      user.publicKey, // payer
      associatedTokenAccount, // associated token account address
      user.publicKey, // owner
      token_mint, // mint
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  
    // Create and sign transaction for associated token account
    let transaction = new Transaction().add(createAssociatedTokenAccountIx);
  
    // Sign and send transaction
    const transactionSignature = await this.provider.send(transaction, [user])
    return [transactionSignature, associatedTokenAccount]
  }

  async createMint(
    mintKeypair: Keypair,
    decimals: number = 9,
    mintAuthority?: PublicKey,
    freezeAuthority?: PublicKey
  ): Promise<string> {
    const authority = mintAuthority || this.payer.publicKey;
    const freeze = freezeAuthority || this.payer.publicKey;

    const createAccountInstruction = SystemProgram.createAccount({
      fromPubkey: this.payer.publicKey,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: await getMinimumBalanceForRentExemptMint(this.provider.connection),
      programId: TOKEN_PROGRAM_ID
    });

    const initializeMintInstruction = createInitializeMintInstruction(
      mintKeypair.publicKey,
      decimals,
      authority,
      freeze,
      TOKEN_PROGRAM_ID
    );

    const transaction = new Transaction().add(
      createAccountInstruction,
      initializeMintInstruction
    );

    const transactionSignature = await this.provider.send(transaction, [this.payer, mintKeypair]);

    return transactionSignature;
  }

  async createToken0Mint(): Promise<string> {
    return await this.createMint(this.token0_mint);
  }

  async createToken1Mint(): Promise<string> {
    return await this.createMint(this.token1_mint);
  }

  async getMintInfo(mintPublicKey: PublicKey): Promise<any> {
    const info = await this.provider.client.getAccount(mintPublicKey);
    return unpackMint(mintPublicKey, info as any, TOKEN_PROGRAM_ID);
  }

  async getTAInfo(tokenAcount: PublicKey):Promise<any> {
    const info = await this.provider.client.getAccount(tokenAcount);
    return unpackAccount(tokenAcount, info as any, TOKEN_PROGRAM_ID)
  }

  // Utility method to log mint creation details
  async logMintCreation(mintKeypair: Keypair, transactionSignature: string): Promise<void> {
    console.log("Mint Address: ", mintKeypair.publicKey.toBase58());
    console.log("Transaction Signature: ", transactionSignature);
    console.log("Mint account", await this.getMintInfo(mintKeypair.publicKey));
  }

  // Method to setup both token mints
  async setupTokenMints(): Promise<{
    token0Signature: string;
    token1Signature: string;
  }> {
    const token0Signature = await this.createToken0Mint();
    const token1Signature = await this.createToken1Mint();

    return {
      token0Signature,
      token1Signature
    };
  }
}
