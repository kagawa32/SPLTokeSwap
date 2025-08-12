use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, Transfer, MintTo, Burn},
};

mod utils;
use utils::{init_liquidity, get_optimal_b, get_optimal_a, 
    cacl_liquidity, get_token_amount, get_amount_b_out, get_amount_a_out, MIN_LIQUIDITY,
MINT_SEED, POOL_SEED};

declare_id!("ESKCtzJykZmkZ158YbUXRsaKJn1CxQ1KxpHEKVRZY3At");
// bump 存储
#[program]
pub mod spl_swap {

    use super::*;

    // init account in separate functions, due to issue 
    // https://github.com/solana-foundation/anchor/pull/2939, https://github.com/solana-foundation/anchor/issues/2920
    pub fn create_amm(ctx: Context<CreateAmm>) -> Result<()> {
        let amm = &mut ctx.accounts.amm;
        amm.admin = ctx.accounts.payer.key();
        amm.bump = ctx.bumps.amm;
        emit!(AMMEvent{message: "amm created".to_string(), creator: amm.admin});
        Ok(())
    }

    pub fn create_pool(ctx: Context<CreatePool>) ->Result<()> {
        let pool_account = &mut ctx.accounts.pool_account;
        pool_account.amm = ctx.accounts.amm.admin;
        pool_account.mint_a = ctx.accounts.mint_a.key();
        pool_account.mint_b = ctx.accounts.mint_b.key();
        pool_account.bump = ctx.bumps.pool_account;
        // event emit
        emit!(AMMEvent{message: "pool created".to_string(), creator: pool_account.amm});
        Ok(())
    }

    pub fn create_pool_token(_ctx: Context<CreatePoolToken>) ->Result<()>{
        Ok(())
    }


    pub fn add_liquidity(ctx: Context<AddLiquidity>, amount_a: u64, amount_b: u64, min_amount_a: u64, min_amount_b: u64) -> Result<()> {
        let pool_account_a = &mut ctx.accounts.pool_account_a;
        let pool_account_b = &mut ctx.accounts.pool_account_b;
        let mut acctual_a:u64;
        let acctual_b:u64;
        let liquidity_to_add: u64 ;
        if pool_account_a.amount == 0 && pool_account_b.amount == 0 {
            acctual_a = amount_a;
            acctual_b = amount_b;
            // Computing the amount of liquidity about to be deposited
            let mut liquidity = init_liquidity(amount_a, amount_b);
            require!(liquidity > MIN_LIQUIDITY, CustError::DepositTooSmall);
            liquidity -= MIN_LIQUIDITY;
            liquidity_to_add = liquidity;
        }else {
            acctual_a = amount_a;
            // optimalb = amout_a * poolb /poola
            let optimalb = get_optimal_b(amount_a, ctx.accounts.pool_account_a.amount, ctx.accounts.pool_account_b.amount);
            if optimalb < amount_b && optimalb >=min_amount_b{
                acctual_b = optimalb;
            }else{
                acctual_b = amount_b;
                // optimala = amout_b * poola /poolb
                let optimala = get_optimal_a(amount_b, ctx.accounts.pool_account_a.amount, ctx.accounts.pool_account_b.amount);
                require!(optimala < amount_a, CustError::InsufficentInputTokenA);
                require!(optimala >= min_amount_a, CustError::InsufficentOutputTokenA);
                acctual_a = optimala;
            }

            // record amount_a before transfer
            let pool_account_a = ctx.accounts.pool_account_a.amount;
            let pool_account_b = ctx.accounts.pool_account_b.amount;

            // Computing the amount of liquidity to be deposited

            let total_supply = ctx.accounts.mint_liquidity.supply;
            liquidity_to_add = cacl_liquidity(total_supply, acctual_a, pool_account_a, acctual_b, pool_account_b);
        }
        // transfer from depositor's token account to pool_account
        token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_account_a.to_account_info(),
                    to: ctx.accounts.pool_account_a.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            acctual_a,
        )?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.depositor_account_b.to_account_info(),
                    to: ctx.accounts.pool_account_b.to_account_info(),
                    authority: ctx.accounts.depositor.to_account_info(),
                },
            ),
            acctual_b,
        )?;

        // Mint the liquidity to user

        let authority_bump = ctx.bumps.pool_account;
        let authority_seeds = &[
            &ctx.accounts.pool_account.amm.to_bytes(),
            &ctx.accounts.mint_a.key().to_bytes(),
            &ctx.accounts.mint_b.key().to_bytes(),
            POOL_SEED,
            &[authority_bump],
        ];
        let signer_seeds = &[&authority_seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint_liquidity.to_account_info(),
                    to: ctx.accounts.depositor_account_liquidity.to_account_info(),
                    authority: ctx.accounts.pool_account.to_account_info(),
                },
                signer_seeds,
            ),
            liquidity_to_add,
        )?;
        //event
        emit!(AddLiquidityEvent{message:"add liquidity".to_string(), operator: ctx.accounts.depositor.key(), amount_a: acctual_a, amount_b: acctual_b});
        Ok(())
    }

    pub fn remove_liquidity(ctx: Context<RemoveLiquidity>, liquidity: u64, min_amount_a: u64, min_amount_b: u64)->Result<()>{
        let amount_a = get_token_amount(liquidity, ctx.accounts.mint_liquidity.supply, ctx.accounts.pool_account_a.amount);
        let amount_b = get_token_amount(liquidity, ctx.accounts.mint_liquidity.supply, ctx.accounts.pool_account_b.amount);
        require!(amount_a>=min_amount_a, CustError::InsufficentOutputTokenA);
        require!(amount_b>=min_amount_b, CustError::InsufficentOutputTokenB);

        // transfer token from pool account to depositor account
        let authority_bump = ctx.bumps.pool_account;
        let authority_seeds = &[
            &ctx.accounts.pool_account.amm.to_bytes(),
            &ctx.accounts.mint_a.key().to_bytes(),
            &ctx.accounts.mint_b.key().to_bytes(),
            POOL_SEED,
            &[authority_bump],
        ];
        let signer_seeds = &[&authority_seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_account_a.to_account_info(),
                    to: ctx.accounts.depositor_account_a.to_account_info(),
                    authority: ctx.accounts.pool_account.to_account_info(),
                },
                signer_seeds
            ),
            amount_a,
        )?;

        token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_account_b.to_account_info(),
                    to: ctx.accounts.depositor_account_b.to_account_info(),
                    authority: ctx.accounts.pool_account.to_account_info(),
                },
                signer_seeds
            ),
            amount_b,
        )?;

        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn{
                    mint: ctx.accounts.mint_liquidity.to_account_info(),
                    from: ctx.accounts.depositor_account_liquidity.to_account_info(),
                    authority:ctx.accounts.depositor.to_account_info()
                }
            ),
            liquidity)?;
        emit!(RemoveLiquidityEvent{message:"add liquidity".to_string(), operator: ctx.accounts.depositor.key(), lp_token:liquidity});
        Ok(())
    }

    pub fn swap_extacttoken_fortoken(ctx: Context<Swap>, amount: u64, min_output: u64, output_b:bool)->Result<()>{
        let current_amount_a = ctx.accounts.pool_account_a.amount;
        let current_amount_b = ctx.accounts.pool_account_b.amount;
        let output:u64;
        if output_b{
            let output_amount = get_amount_b_out(amount, current_amount_a, current_amount_b);
            require!(output_amount >=min_output, CustError::InsufficientOutputAmount);
            output = output_amount;
            // transfer input to pool
            token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.depositor_account_a.to_account_info(),
                        to: ctx.accounts.pool_account_a.to_account_info(),
                        authority: ctx.accounts.depositor.to_account_info(),
                    },
                ),
                amount,
            )?;
            // transfer output to depositor
            let authority_bump = ctx.bumps.pool_account;
            let authority_seeds = &[
                &ctx.accounts.pool_account.amm.to_bytes(),
                &ctx.accounts.mint_a.key().to_bytes(),
                &ctx.accounts.mint_b.key().to_bytes(),
                POOL_SEED,
                &[authority_bump],
            ];
            let signer_seeds = &[&authority_seeds[..]];
            token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_account_b.to_account_info(),
                    to: ctx.accounts.depositor_account_b.to_account_info(),
                    authority: ctx.accounts.pool_account.to_account_info(),
                },
                signer_seeds
            ),
            output_amount,
            )?;


        }else{
            let output_amount = get_amount_a_out(amount, current_amount_a, current_amount_b);
            require!(output_amount >=min_output, CustError::InsufficientOutputAmount);
            output = output_amount;
            // transfer input to pool
            token::transfer(
            CpiContext::new(ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.depositor_account_b.to_account_info(),
                        to: ctx.accounts.pool_account_b.to_account_info(),
                        authority: ctx.accounts.depositor.to_account_info(),
                    },
                ),
                amount,
            )?;
            // transfer output to depositor
            let authority_bump = ctx.bumps.pool_account;
            let authority_seeds = &[
                &ctx.accounts.pool_account.amm.to_bytes(),
                &ctx.accounts.mint_a.key().to_bytes(),
                &ctx.accounts.mint_b.key().to_bytes(),
                POOL_SEED,
                &[authority_bump],
            ];
            let signer_seeds = &[&authority_seeds[..]];
            token::transfer(
            CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_account_a.to_account_info(),
                    to: ctx.accounts.depositor_account_a.to_account_info(),
                    authority: ctx.accounts.pool_account.to_account_info(),
                },
                signer_seeds
            ),
            output_amount,
            )?;
        }
        // event
        emit!(SwapEvent{message:"swap token".to_string(), operator:ctx.accounts.depositor.key(), input: amount, output: output });
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateAmm<'info> {
    #[account(
        init,
        payer = payer,
        space = 8+32+1,
        seeds = [payer.key().as_ref()],
        bump,
    )]
    pub amm: Box<Account<'info, Amm>>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct Amm {
    admin: Pubkey,
    pub bump: u8,

}

#[derive(Accounts)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,

    pub mint_a: Box<Account<'info, Mint>>,
    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        seeds = [amm.admin.as_ref()],
        bump = amm.bump,
        has_one = admin,
    )]
    pub amm: Box<Account<'info, Amm>>,
    // authority pool
    #[account(
        init,
        payer = admin,
        space = 8+32+32+32+1,
        seeds = [
            amm.admin.as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
            POOL_SEED
        ],
        bump,        
    )]
    pub pool_account: Box<Account<'info, Pool>>,

    // create LP mint account, 权限 
    #[account(
        init,
        payer = admin,
        seeds = [
            amm.admin.as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(), 
            MINT_SEED],
        bump,
        mint::decimals = 6,
        mint::authority = pool_account,
    )]
    pub mint_liquidity: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,

}

#[derive(Accounts)]
pub struct CreatePoolToken<'info>{
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,

    pub mint_a: Box<Account<'info, Mint>>,
    pub mint_b: Box<Account<'info, Mint>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    #[account(
        seeds = [amm.admin.as_ref()],
        bump=amm.bump
    )]
    pub amm: Box<Account<'info, Amm>>,

    #[account(
        seeds = [
            amm.admin.as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
            POOL_SEED
        ],
        bump=pool_account.bump,        
    )]
    pub pool_account: Box<Account<'info, Pool>>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint_a,
        associated_token::authority = pool_account,
    )]
    pub pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint_b,
        associated_token::authority = pool_account,
    )]
    pub pool_account_b: Box<Account<'info, TokenAccount>>,


}

#[account]
#[derive(Default)]
pub struct Pool{
    mint_a: Pubkey,
    mint_b: Pubkey,
    amm: Pubkey,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(
        seeds = [
            pool_account.amm.as_ref(),
            pool_account.mint_a.key().as_ref(),
            pool_account.mint_b.key().as_ref(),
            POOL_SEED
        ],
        bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool_account: Box<Account<'info, Pool>>,

    #[account(mut)]
    pub depositor: Signer<'info>,
    pub mint_a: Box<Account<'info, Mint>>,
    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [
            pool_account.amm.as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
            MINT_SEED,
        ],
        bump,
    )]
    pub mint_liquidity: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = pool_account,
    )]
    pub pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = pool_account,
    )]
    pub pool_account_b: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = mint_liquidity,
        associated_token::authority = depositor,
    )]
    pub depositor_account_liquidity: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = depositor,
    )]
    pub depositor_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = depositor,
    )]
    pub depositor_account_b: Box<Account<'info, TokenAccount>>,



    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(
        seeds = [
            pool_account.amm.as_ref(),
            pool_account.mint_a.key().as_ref(),
            pool_account.mint_b.key().as_ref(),
            POOL_SEED
        ],
        bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool_account: Box<Account<'info, Pool>>,

    pub depositor: Signer<'info>,
    pub mint_a: Box<Account<'info, Mint>>,
    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [
            pool_account.amm.as_ref(),
            mint_a.key().as_ref(),
            mint_b.key().as_ref(),
            MINT_SEED,
        ],
        bump,
    )]
    pub mint_liquidity: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = pool_account,
    )]
    pub pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = pool_account,
    )]
    pub pool_account_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_liquidity,
        associated_token::authority = depositor,
    )]
    pub depositor_account_liquidity: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = depositor,
    )]
    pub depositor_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = depositor,
    )]
    pub depositor_account_b: Box<Account<'info, TokenAccount>>,


    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(
        seeds = [
            pool_account.amm.as_ref(),
            pool_account.mint_a.key().as_ref(),
            pool_account.mint_b.key().as_ref(),
            POOL_SEED
        ],
        bump,
        has_one = mint_a,
        has_one = mint_b,
    )]
    pub pool_account: Box<Account<'info, Pool>>,

    pub depositor: Signer<'info>,
    pub mint_a: Box<Account<'info, Mint>>,
    pub mint_b: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = pool_account,
    )]
    pub pool_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = pool_account,
    )]
    pub pool_account_b: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_a,
        associated_token::authority = depositor,
    )]
    pub depositor_account_a: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = mint_b,
        associated_token::authority = depositor,
    )]
    pub depositor_account_b: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

}


#[event]
pub struct AMMEvent {
    pub message: String,
    pub creator: Pubkey,
}

#[event]
pub struct AddLiquidityEvent {
    pub message: String,
    pub operator: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64
}

#[event]
pub struct SwapEvent {
    pub message: String,
    pub operator: Pubkey,
    pub input: u64,
    pub output: u64
}

#[event]
pub struct RemoveLiquidityEvent {
    pub message: String,
    pub operator: Pubkey,
    pub lp_token: u64,
}




#[error_code]
pub enum CustError {
    #[msg("Depositing too little liquidity")]
    DepositTooSmall,

    #[msg("Insufficient input tokenA")]
    InsufficentInputTokenA,

    #[msg("Insufficient output tokenA")]
    InsufficentOutputTokenA,

    #[msg("Insufficient output tokenB")]
    InsufficentOutputTokenB,

    #[msg("Insufficient output amount")]
    InsufficientOutputAmount
}



