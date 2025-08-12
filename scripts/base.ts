import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  PublicKey
} from "@solana/web3.js";
import {
  createInitializeMintInstruction,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMintToInstruction,
  createBurnInstruction,
} from "@solana/spl-token";

/**
 * 创建一个新的SPL token mint
 * @param connection - Solana连接对象
 * @param feePayer - 支付交易费用的keypair
 * @param decimals - token的小数位数，默认为9
 * @param mintAuthority - mint权限，默认为feePayer的publicKey
 * @param freezeAuthority - 冻结权限，默认为feePayer的publicKey
 * @returns 包含mint keypair和交易签名的对象
 */
export async function create_token_mint(
  connection: Connection,
  feePayer: Keypair,
  decimals: number = 9,
  mintAuthority?: PublicKey,
  freezeAuthority?: PublicKey
): Promise<{
  mint: Keypair;
  transactionSignature: string;
}> {
  // Generate keypair to use as address of mint
  const mint = Keypair.generate();

  // 使用默认值或传入的权限
  const mintAuth = mintAuthority || feePayer.publicKey;
  const freezeAuth = freezeAuthority || feePayer.publicKey;

  const createAccountInstruction = SystemProgram.createAccount({
    fromPubkey: feePayer.publicKey,
    newAccountPubkey: mint.publicKey,
    space: MINT_SIZE,
    lamports: await getMinimumBalanceForRentExemptMint(connection),
    programId: TOKEN_PROGRAM_ID,
  });

  const initializeMintInstruction = createInitializeMintInstruction(
    mint.publicKey, // mint pubkey
    decimals, // decimals
    mintAuth, // mint authority
    freezeAuth, // freeze authority
    TOKEN_PROGRAM_ID,
  );

  const transaction = new Transaction().add(
    createAccountInstruction,
    initializeMintInstruction
  );

  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [feePayer, mint] // Signers
  );

  console.log("Mint Address: ", mint.publicKey.toBase58());
  console.log("Transaction Signature: ", transactionSignature);

  return {
    mint,
    transactionSignature
  };
}

/**
 * 创建一个associated token account
 * @param connection - Solana连接对象
 * @param mintAddress - token mint的地址
 * @param owner - token account的所有者
 * @param payer - 支付交易费用的keypair
 * @returns 包含associated token account地址和交易签名的对象
 */
export async function create_associated_token_account(
  connection: Connection,
  mintAddress: PublicKey,
  owner: PublicKey,
  payer: Keypair
): Promise<{
  associatedTokenAccount: PublicKey;
  transactionSignature: string;
}> {
  // Get the associated token account address
  const associatedTokenAccount = getAssociatedTokenAddressSync(
    mintAddress,
    owner,
    false, // allowOwnerOffCurve
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Create associated token account instruction
  const createAssociatedTokenAccountIx = createAssociatedTokenAccountInstruction(
    payer.publicKey, // payer
    associatedTokenAccount, // associated token account address
    owner, // owner
    mintAddress, // mint
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Create and sign transaction for associated token account
  const transaction = new Transaction().add(createAssociatedTokenAccountIx);

  // Sign and send transaction
  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [payer]
  );

  console.log(
    "Associated Token Account Address:",
    associatedTokenAccount.toBase58()
  );
  console.log("Transaction Signature:", transactionSignature);

  return {
    associatedTokenAccount,
    transactionSignature
  };
}

/**
 * 向指定账户mint token
 * @param connection - Solana连接对象
 * @param tokenAddress - token mint的地址
 * @param accountAddress - 目标账户地址
 * @param authority - mint权限的keypair
 * @param amount - mint的数量
 * @returns 包含交易签名的对象
 */
export async function mint_to(
  connection: Connection,
  tokenAddress: PublicKey,
  accountAddress: PublicKey,
  authority: Keypair,
  amount: number
): Promise<{
  transactionSignature: string;
}> {
  // 创建mint instruction
  const mintToInstruction = createMintToInstruction(
    tokenAddress, // mint
    accountAddress, // destination
    authority.publicKey, // authority of mint account
    amount, // amount
    [], // multiSigners
    TOKEN_PROGRAM_ID, // programId
  );

  // 创建并签名交易
  const mintTransaction = new Transaction().add(mintToInstruction);

  // 签名并发送交易
  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    mintTransaction,
    [authority]
  );

  console.log("Mint Transaction Signature:", transactionSignature);

  return {
    transactionSignature
  };
}

/**
 * 销毁指定账户中的token
 * @param connection - Solana连接对象
 * @param accountAddress - 要销毁token的账户地址
 * @param mintAddress - token mint的地址
 * @param owner - 账户所有者的keypair
 * @param amount - 要销毁的token数量
 * @returns 包含交易签名的对象
 */
export async function burn(
  connection: Connection,
  accountAddress: PublicKey,
  mintAddress: PublicKey,
  owner: Keypair,
  amount: number
): Promise<{
  transactionSignature: string;
}> {
  // 创建burn instruction
  const burnInstruction = createBurnInstruction(
    accountAddress,
    mintAddress,
    owner.publicKey,
    amount,
    [],
    TOKEN_PROGRAM_ID,
  );

  // 创建并签名交易
  const burnTransaction = new Transaction().add(burnInstruction);

  // 签名并发送交易
  const transactionSignature = await sendAndConfirmTransaction(
    connection,
    burnTransaction,
    [owner]
  );

  console.log("Burn Transaction Signature:", transactionSignature);

  return {
    transactionSignature
  };
}
