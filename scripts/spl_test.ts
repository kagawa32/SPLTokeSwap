import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import {
  getAccount,
  getMint,
  createInitializeAccountInstruction,
  TOKEN_PROGRAM_ID,
  ACCOUNT_SIZE,
  getMinimumBalanceForRentExemptAccount
} from "@solana/spl-token";
import { create_token_mint, create_associated_token_account, mint_to, burn } from "./base";


async function main() {

  // Create connection to local validator
  const connection = new Connection("http://localhost:8899", "confirmed");
  const recentBlockhash = await connection.getLatestBlockhash();

  // Generate a new keypair for the fee payer
  const feePayer = Keypair.generate();

  // Airdrop 1 SOL to fee payer
  const airdropSignature = await connection.requestAirdrop(
    feePayer.publicKey,
    LAMPORTS_PER_SOL
  );
  await connection.confirmTransaction({
    blockhash: recentBlockhash.blockhash,
    lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
    signature: airdropSignature
  });

  const user1 = Keypair.generate();
  const user2 = Keypair.generate();

  const airdropSignature1 = await connection.requestAirdrop(
    user1.publicKey,
    LAMPORTS_PER_SOL
  );

  const airdropSignature2 = await connection.requestAirdrop(
    user2.publicKey,
    LAMPORTS_PER_SOL
  );


  // 使用抽象的create_token_mint函数创建mint
  const { mint: token0_mint, transactionSignature } = await create_token_mint(
    connection,
    feePayer,
    9 // decimals
  );

  const {mint: token1_mint, transactionSignature: transactionSignature1} = await create_token_mint(
    connection,
    feePayer,
    9 // decimals
  );


  // 使用抽象的create_associated_token_account函数创建关联token账户
  const { associatedTokenAccount: user1_token0_account, transactionSignature: transactionSignature2 } = 
    await create_associated_token_account(
      connection,
      token0_mint.publicKey, // mint address
      user1.publicKey, // owner
      feePayer // payer
    );

  const { associatedTokenAccount: user1_token1_account, transactionSignature: transactionSignature3 } = 
    await create_associated_token_account(
      connection,
      token1_mint.publicKey, // mint address
      user1.publicKey, // owner
      feePayer // payer
    );

  // 使用抽象的mint_to函数mint token
  const mintAmount = 100;
  const { transactionSignature: mintTransactionSignature } = await mint_to(
    connection,
    token0_mint.publicKey, // token address
    user1_token0_account, // account address
    feePayer, // authority keypair
    mintAmount // amount
  );

  const { transactionSignature: mintTransactionSignature1 } = await mint_to(
    connection,
    token1_mint.publicKey, // token address
    user1_token1_account, // account address
    feePayer, // authority keypair
    mintAmount // amount
  );



  console.log("token0 account after mint:", await connection.getTokenAccountBalance(user1_token0_account))
  console.log("token1 account after mint:", await connection.getTokenAccountBalance(user1_token1_account))

  // 使用抽象的burn函数销毁token
  const burn_amount = 50;
  const { transactionSignature: burnTransactionSignature } = await burn(
    connection,
    user1_token0_account, // account address
    token0_mint.publicKey, // mint address
    user1, // owner keypair
    burn_amount // amount
  );
  const { transactionSignature: burnTransactionSignature1 } = await burn(
    connection,
    user1_token1_account, // account address
    token1_mint.publicKey, // mint address
    user1, // owner keypair
    burn_amount // amount
  );

  console.log("balance after burn:", await connection.getTokenAccountBalance(user1_token0_account))
  console.log("balance after burn:", await connection.getTokenAccountBalance(user1_token1_account))

}

main()