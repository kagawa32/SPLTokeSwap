import { TestBase } from "./base";
import { BN } from "@coral-xyz/anchor";

describe("spl_swap", () => {
  let testBase: TestBase;

  // Configure the client to use the local cluster.
  before(async () => {
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

  });

  it("Is initialized!", async () => {
    // Add your test here.
    // You can now access testBase.swapProgram, testBase.payer, etc.

  });
});
