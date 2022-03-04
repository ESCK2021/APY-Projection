// ---------------------------------------- Specification ---------------------------------------------
const ethers = require('ethers');
const websocket = require('ws');
const fetch = require("node-fetch"); //@v2-compatible with CommonJS
require("dotenv").config();
const provider = new ethers.providers.WebSocketProvider(process.env.WWS); // Using WebSocket to ensure live data

const api_CAKE = 'https://api.pancakeswap.info/api/v2/tokens/0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82'; // API_URL of CAKE token
const api_pairs_CAKE_BNB = 'https://api.pancakeswap.info/api/v2/pairs'; // API_URL of pair tokens
const address = {
    router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap RouterV2 contract
    BUSD: '0xe9e7cea3dedca5984780bafc599bd69add087d56', // BUSD contract
    CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', // CAKE contract
    Pair_CAKE_BNB: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82_0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // CAKE-WBNB Pair contract
}

const period = 365; // Days
// Commom variables (Dependent to PancakeSwap proposols and updates)
const totalFarmMultiplier = 102.1; //Asked admin, need to add up manually
const totalEmissionPerDay = 72400;

// Target info
const name = "CAKE-BNB"; // Target
const farmMultiplier = 40; // Can use "getMultiplier" function to track bonus reward
// ------------------------------------------ Get Data -----------------------------------------------
// Get require data: // (Alternatives: Use subgraph)
// 1. Get CAKE/USD (BUSD)
// 2. Get BaseQuote Volume(24hrs) - Data are cached for 5 mins, UI will be 10mins(fromm Github)
// 3. Get Liquidlity of CAKE_WBNB pair in term of CAKE

// Get price of CAKE token, two methods are available:

// 1. Smart Contract method - from router contract(v2), commented!
// const router = new ethers.Contract(
//     address.router,
//     ['function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)'],
//     provider
// );
// async function token_price(base, quote) {
//     const price = await router.getAmountsOut(ethers.utils.parseUnits('1', 18), [base, quote]);
//     return parseFloat(price[1].toString()/1e18);
// }

// 2. API method
async function token_price(api_token) {
        try {
            const response = await fetch(api_token);
            const data = await response.json();
            return parseFloat(data.data.price);
        } catch (e) {
            console.log(e);
            console.log("Cannot fetch token info!");
            return 0;
        }
}
// Note: Cannot get volume and liquidity from smart contract directly, hence uses API
// Get base_volume of CAKE-BNB pair
async function pairs_volume(api_pairs, address_Pair) {
        try {
            const response = await fetch(api_pairs); // API_URL of pair tokens
            const data = await response.json();
            const base_volume = parseFloat(data.data[address_Pair].base_volume);
            return base_volume;
        } catch (e) {
            console.log(e);
            console.log("Cannot fetch pairs volume!");
            return 0, 0;
        }
}
// Get liquidity of CAKE-BNB pair
async function pairs_liquidity(api_pairs, address_Pair) {
    try {
        const response = await fetch(api_pairs); // API_URL of pair tokens
        const data = await response.json();
        const liquidity = parseFloat(data.data[address_Pair].liquidity);
        return liquidity;
    } catch (e) {
        console.log(e);
        console.log("Cannot fetch pairs liquidity!");
        return 0, 0;
    }
}
// ------------------------------------ Assumptions on Return -------------------------------------------
// 1. Added amount has no significant effect on liquidity, e.g. 1 / (1*10^8 + 1)
// 2. No swap fee and gas fee occured (Reinvestment)
// 3. No price impact for reinvestmnet
// --------------------------------------- Daily LP Return ----------------------------------------------
// @Parameters(Referencing Pancake Swap documentation):
// 1. Farmer earnings from trading fee per transaction = 0.17%
// 2. APY projection is based on 24hrs volume

// Get Daily LP APY
function daily_LP_return(price, baseVolume, liquidity) {
    try {
        // Convert base_volume in term of usd
        const volume = baseVolume * price;
        //calculate amount received:  total tx fee per day/ total liquidity
        return volume * 0.0017 / liquidity;
    } catch (e) {
        console.log(e);
        console.log("Cannot compute daily LP return!");
    }
}    
// -------------------------------------- Daily Farm Return ----------------------------------------------
// @Parameters(Referencing PancakeSwap documentation):
// 1. Total emission to farms per day = 72400 CAKE apporximately (may affect by future community proposal)
// 2. Farm mutiplier of CAKE-BNB = 40x (may affect by incentives and proposal)
// 3. Total farm multiplier =  (may affect by future added pool) [Record:2022-03-02]

// Get Daily Farm APY
function daily_Farm_return(price, liquidity) {
    try {
        //no of CAKE in CAKE-BNB farm received/day  
        const token_num = totalEmissionPerDay / totalFarmMultiplier * farmMultiplier;
        //daily farm return = no of CAKE * price of CAKE / inital deposit
        return token_num * price / liquidity;
    } catch (e) {
        console.log(e);
        console.log("Cannot compute daily farm return!");
    }
}
// -------------------------------- Total APY with daily coumpounding -----------------------------------
// Get total APY with daily auto-compounded
function calculate_total_APY_compounded(LpDailyReturn, FarmDailyReturn) {
    try {
        // Return daily-compounded APY
        return ((LpDailyReturn + FarmDailyReturn + 1) ** (period - 1) - 1);
    } catch (e) {
        console.log(e);
        console.log("Cannot compute Total APY");
    }
}
// --------------------------------------- Main function -------------------------------------------------
async function main() {
    // Get CAKE price
    //const CAKE_price = await token_price(address.CAKE, address.BUSD); // Method 1
    const CAKE_price = await token_price(api_CAKE); // Method 2
    //Get CAKE_WBNB volume and liquidity
    const base_volume_CAKE = await pairs_volume(api_pairs_CAKE_BNB, address.Pair_CAKE_BNB);
    const liquidity_CAKE_BNB = await pairs_liquidity(api_pairs_CAKE_BNB, address.Pair_CAKE_BNB);
    // Calculation
    const Daily_LP_Return = daily_LP_return(CAKE_price, base_volume_CAKE, liquidity_CAKE_BNB);
    const Daily_Farm_Return = daily_Farm_return(CAKE_price, liquidity_CAKE_BNB);
    const Total_APY_Compounded = calculate_total_APY_compounded(Daily_LP_Return, Daily_Farm_Return);
    // Show APY (LP, Farm, Total)
    console.log(
        name, ":\n", // Indicate target
        "APY in LP Reward: ", Daily_LP_Return * period * 100, "%\n",
        "APY in Farm Base: ", Daily_Farm_Return * period * 100, "%\n",
        "Total APY: ", Total_APY_Compounded * 100, "%"
    );
    setTimeout(main, 10000); // Continuously update every 10s
}

main()