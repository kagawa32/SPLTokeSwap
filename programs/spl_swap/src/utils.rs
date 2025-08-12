use anchor_lang::prelude::{constant};
use fixed::types::I64F64;

pub fn init_liquidity(amount_a:u64, amount_b:u64)->u64{
    // Computing the amount of liquidity about to be deposited
    let liquidity = I64F64::from_num(amount_a)
        .checked_mul(I64F64::from_num(amount_b))
        .unwrap()
        .sqrt()
        .to_num::<u64>();
    liquidity
}

pub fn cacl_liquidity(total_supply:u64, amount_a: u64, pool_amount_a: u64, amount_b: u64, pool_amount_b:u64)->u64{
    let ratio_a = I64F64::from_num(amount_a)
                    .checked_div(I64F64::from_num(pool_amount_a))
                    .unwrap();
    let ratio_b = I64F64::from_num(amount_b)
    .checked_div(I64F64::from_num(pool_amount_b)).unwrap();
    let mut ratio = ratio_a;
    if ratio_a > ratio_b{
        ratio = ratio_b;
    }

    let liquidity = I64F64::from_num(total_supply)
            .checked_mul(I64F64::from_num(ratio))
            .unwrap()
            .to_num::<u64>();
    liquidity
}

pub fn get_optimal_b(amount_a: u64, current_a: u64, current_b:u64) ->u64 {
    // 内部decimal
    let ratio = I64F64::from_num(current_b)
        .checked_div(I64F64::from_num(current_a))
        .unwrap();

    let optimalb = I64F64::from_num(amount_a)
            .checked_mul(ratio)
            .unwrap()
            .to_num::<u64>();
    optimalb
}

pub fn get_optimal_a(amount_b: u64, current_a: u64, current_b:u64) ->u64 {
    let ratio = I64F64::from_num(current_a)
        .checked_div(I64F64::from_num(current_b))
        .unwrap();

    let optimala = I64F64::from_num(amount_b)
            .checked_mul(ratio)
            .unwrap()
            .to_num::<u64>();
    optimala
}

pub fn get_token_amount(liquidity:u64, total_liquidity:u64, amount: u64)->u64{
    let ratio = I64F64::from_num(liquidity).checked_div(I64F64::from_num(total_liquidity + MIN_LIQUIDITY))
    .unwrap();

    let output = I64F64::from_num(amount).checked_mul(ratio)
    .unwrap().to_num::<u64>();

    output
}

pub fn get_amount_b_out(amount: u64, current_amount_a: u64, current_amount_b:u64)->u64 {
    // outputb = (inputa * current_amount_b*0.997)/(inputa*0.997+current_amount_a)
    let mut numerator = I64F64::from_num(amount).checked_mul(I64F64::from_num(current_amount_b)).unwrap();
    numerator = numerator.checked_mul(I64F64::from_num(0.997)).unwrap();
    let mut denominator = I64F64::from_num(amount).checked_mul(I64F64::from_num(0.997)).unwrap();
    denominator = denominator + I64F64::from_num(current_amount_a);

    let output = I64F64::from_num(numerator).checked_div(denominator).unwrap().to_num::<u64>();
    output
}

pub fn get_amount_a_out(amount: u64, current_amount_a: u64, current_amount_b:u64)->u64 {
    // outputa = (inputb * current_amount_a*0.997)/(inputb*0.997+current_amount_b)
    let mut numerator = I64F64::from_num(amount).checked_mul(I64F64::from_num(current_amount_a)).unwrap();
    numerator = numerator.checked_mul(I64F64::from_num(0.997)).unwrap();
    let mut denominator = I64F64::from_num(amount).checked_mul(I64F64::from_num(0.997)).unwrap();
    denominator = denominator + I64F64::from_num(current_amount_b);

    let output = I64F64::from_num(numerator).checked_div(denominator).unwrap().to_num::<u64>();
    output
}

#[constant]
pub const MIN_LIQUIDITY: u64 = 1000;

#[constant]
pub const MINT_SEED: &[u8] = b"LP_MINT";

#[constant]
pub const POOL_SEED: &[u8] = b"POOL";