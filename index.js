import "dotenv/config";
import { ethers } from "ethers";
import readline from "readline";

const CONTRACT = "0x0e29d74af0489f4b08fbfc774e25c0d3b5f43285";
const RPC_URL = "https://testnet.dplabs-internal.com"; 
const provider = new ethers.JsonRpcProvider(RPC_URL);


const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; 


function loadPrivateKeys() {
  const privateKeys = [];
  let index = 1;
  
  while (process.env[`PRIVATE_KEY_${index}`]) {
    privateKeys.push(process.env[`PRIVATE_KEY_${index}`]);
    index++;
  }
  
  
  if (process.env.PRIVATE_KEY && privateKeys.length === 0) {
    privateKeys.push(process.env.PRIVATE_KEY);
  }
  
  return privateKeys;
}

async function retryWithDelay(fn, retries = MAX_RETRIES, delay = RETRY_DELAY) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) {
        throw error;
      }
      await sleep(delay);
    }
  }
}

async function FaucetFunction(wallet) {
  const walletAddress = wallet.address.slice(2);
  const GOLD_DATA = `0xc6c3bbe6000000000000000000000000aaf03cbb486201099edd0a52e03def18cd0c7354000000000000000000000000${walletAddress}0000000000000000000000000000000000000000000000056bc75e2d63100000`;
  const NVDIA_DATA = `0xc6c3bbe6000000000000000000000000a778b48339d3c6b4bc5a75b37c6ce210797076b1000000000000000000000000${walletAddress}0000000000000000000000000000000000000000000000056bc75e2d63100000`;
  const TSLA_DATA = `0xc6c3bbe6000000000000000000000000aaf3a7f1676385883593d7ea7ea4fccc675ee5d6000000000000000000000000${walletAddress}0000000000000000000000000000000000000000000000056bc75e2d63100000`;

  const transactions = [
    { data: GOLD_DATA },
    { data: NVDIA_DATA },
    { data: TSLA_DATA }
  ];

  for (const { data } of transactions) {
    try {
      await retryWithDelay(async () => {
        const request = { to: CONTRACT, data };
        const tx = await wallet.sendTransaction(request);
        await tx.wait();
      });
    } catch (error) {
      
    }
  }
}

const approveToken = async (wallet, tokenAddress, spenderAddress, amount) => {
  const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];

  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    const owner = await wallet.getAddress();
    
    const currentAllowance = await retryWithDelay(async () => {
      return await tokenContract.allowance(owner, spenderAddress);
    });

    if (currentAllowance >= amount) {
      return;
    } else {
      await retryWithDelay(async () => {
        const tx = await tokenContract.approve(spenderAddress, amount);
        await tx.wait();
      });
    }
  } catch (error) {
    
  }
};

const supplyToken = async (wallet, tokenAddress, amount) => {
  const LENDING_ABI = [
    "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  ];
  
  try {
    await retryWithDelay(async () => {
      const tokenContract = new ethers.Contract(
        "0x11d1ca4012d94846962bca2fbd58e5a27ddcbfc5",
        LENDING_ABI,
        wallet
      );

      const tx = await tokenContract.supply(
        tokenAddress,
        amount,
        wallet.address,
        0
      );
      
      await tx.wait();
    });
  } catch (error) {
    
  }
};

const processAccount = async (wallet, times, accountIndex, totalAccounts) => {
  console.log(`Account ${accountIndex}/${totalAccounts}: ${wallet.address}`);
  
  try {
    console.log("Faucet...");
    await FaucetFunction(wallet);
    console.log("Approving...");
    
    const tokens = [
      "0xaaf03cbb486201099edd0a52e03def18cd0c7354", 
      "0xaaf3a7f1676385883593d7ea7ea4fccc675ee5d6", 
      "0xa778b48339d3c6b4bc5a75b37c6ce210797076b1"  
    ];

    for (const token of tokens) {
      await approveToken(
        wallet,
        token,
        "0x11d1ca4012d94846962bca2fbd58e5a27ddcbfc5",
        ethers.parseUnits("1000.0", 18)
      );
    }
    
    await sleep(5000);
    console.log("Starting supply loop...");

    for (let i = 0; i < times; i++) {
      console.log(`${i + 1}/${times}`);
      const randomAmount1 = (Math.random() * 2 + 1).toFixed(6);
      const randomAmount2 = (Math.random() * 2 + 1).toFixed(6);

      await supplyToken(
        wallet,
        "0xaaf3a7f1676385883593d7ea7ea4fccc675ee5d6",
        ethers.parseUnits(randomAmount1, 18)
      );
      await sleep(5000);

      await supplyToken(
        wallet,
        "0xa778b48339d3c6b4bc5a75b37c6ce210797076b1",
        ethers.parseUnits(randomAmount1, 18)
      );
      await sleep(5000);

      await supplyToken(
        wallet,
        "0xaaf03cbb486201099edd0a52e03def18cd0c7354",
        ethers.parseUnits(randomAmount2, 18)
      );
      await sleep(5000);
    }
    
  } catch (error) {

  }
};

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const main = async () => {
  const privateKeys = loadPrivateKeys();
  
  if (privateKeys.length === 0) {
    console.log("No private keys found in .env file!");
    process.exit(1);
  }

  console.log(`Found ${privateKeys.length} accounts`);
  
  rl.question(
    "Supply Tx count?(type 50 if this is first time) ",
    async (answer) => {
      const times = parseInt(answer);

      if (isNaN(times) || times <= 0) {
        console.log("Please enter a valid positive number.");
        rl.close();
        return;
      }

      for (let i = 0; i < privateKeys.length; i++) {
        try {
          const wallet = new ethers.Wallet(privateKeys[i], provider);
          await processAccount(wallet, times, i + 1, privateKeys.length);

          if (i < privateKeys.length - 1) {
            await sleep(10000);
          }
        } catch (error) {
          
        }
      }

      console.log("All accounts processed");
      rl.close();
    }
  );
};

main().catch((error) => {
  console.error("❌ Fatal error:", error.message);
  process.exit(1);
});
