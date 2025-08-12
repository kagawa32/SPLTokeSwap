import { TestBase } from "./base";
import { BN } from "@coral-xyz/anchor";
import bs58 from 'bs58';

describe("spl_swap", () => {
  let testBase: TestBase;

  it("full swap", async () => {
    // Add your test here.

    testBase = new TestBase();
    await testBase.initialize();
    
    // Create token0 mint and log details
    await testBase.createToken0Mint();
    await testBase.createToken1Mint();
    await testBase.setup_user_token();
    await testBase.mint_token_to_user(testBase.user0, testBase.token0_mint.publicKey, BigInt(100000));
    await testBase.mint_token_to_user(testBase.user0, testBase.token1_mint.publicKey, BigInt(100000));

    await testBase.mint_token_to_user(testBase.user1, testBase.token0_mint.publicKey, BigInt(100000));
    await testBase.mint_token_to_user(testBase.user1, testBase.token1_mint.publicKey, BigInt(100000));
    await testBase.create_amm(testBase.payer);
    await testBase.create_pool(testBase.payer, testBase.payer.publicKey);
    await testBase.create_pool_token();

    console.log('user0 token0 amount before add lq', (await testBase.getTAInfo(testBase.user0_token0_account)).amount);
    console.log('user0 token1 amount before add lq', (await testBase.getTAInfo(testBase.user0_token1_account)).amount);
    // user0 add liquidity
    await testBase.add_liquidity(testBase.user0, new BN(10000), new BN(10000), new BN(1000), new BN(1000));
    console.log('user0 token0 amount after add lq', (await testBase.getTAInfo(testBase.user0_token0_account)).amount);
    console.log('user0 token1 amount after add lq', (await testBase.getTAInfo(testBase.user0_token1_account)).amount);
    console.log('user0 lp amount after add lq', (await testBase.getTAInfo(testBase.get_depositor_lp_account(testBase.user0))).amount);


    // swap 
    await testBase.swap(testBase.user1, new BN(1000), new BN(500), true);
    console.log('user1 token0 amount after swap', (await testBase.getTAInfo(testBase.user1_token0_account)).amount);
    console.log('user1 token1 amount after swap',(await testBase.getTAInfo(testBase.user1_token1_account)).amount);

    console.log('pool token0 amount after swap', (await testBase.getTAInfo(testBase.pool_token0_account)).amount);
    console.log('pool token0 amount after swap', (await testBase.getTAInfo(testBase.pool_token1_account)).amount)
    // user0 remove liquidity
    let transactionSignature = await testBase.remove_liquidity(testBase.user0, new BN(5000), new BN(5000), new BN(9000));
    const txSignatureBytes = bs58.decode(transactionSignature);
    const tx = await testBase.client.getTransaction(txSignatureBytes);
    // console.log(tx.logs());

    console.log('user0 token1 amount after remove lq', (await testBase.getTAInfo(testBase.user0_token0_account)).amount);
    console.log('user0 token1 amount after remove lq', (await testBase.getTAInfo(testBase.user0_token1_account)).amount);

  });
});
