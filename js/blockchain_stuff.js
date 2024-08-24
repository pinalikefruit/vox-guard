const NETWORK_ID = 11155111

const VOX_GUARD_ADDRESS = "0x07e63021c489d53B3b4C033c38bAb9B308E0045c"
const VOX_GUARD_ABI_PATH = "./json_abi/VoxGuard.json"

const POSEIDON_ADDRESS = "0xaC6Ce4E0dFBB4E7386DA06C6F6753C1696297C6f"
const POSEIDON_ABI_PATH = "./json_abi/Poseidon.json"

const RELAYER_URL = "http://localhost:8080"

var voxGuardContract
var poseidonContract

var accounts
var web3
let leaves

function metamaskReloadCallback() {
  window.ethereum.on('accountsChanged', (accounts) => {
    document.getElementById("web3_message").textContent="Account changed, refreshing...";
    window.location.reload()
  })
  window.ethereum.on('networkChanged', (accounts) => {
    document.getElementById("web3_message").textContent="...network, refreshing...";
    window.location.reload()
  })
}

const getWeb3 = async () => {
  return new Promise((resolve, reject) => {
    if(document.readyState=="complete")
    {
      if (window.ethereum) {
        const web3 = new Web3(window.ethereum)
        window.location.reload()
        resolve(web3)
      } else {
        reject("must install MetaMask")
        document.getElementById("web3_message").textContent="Error: Please connect Metamask";
      }
    }else
    {
      window.addEventListener("load", async () => {
        if (window.ethereum) {
          const web3 = new Web3(window.ethereum)
          resolve(web3)
        } else {
          reject("must install MetaMask")
          document.getElementById("web3_message").textContent="Error: Please connect Metamask";
        }
      });
    }
  });
};

const getContract = async (web3, address, abi_path) => {
  const response = await fetch(abi_path);
  const data = await response.json();

  const netId = await web3.eth.net.getId();
  contract = new web3.eth.Contract(
    data,
    address
    );
  return contract
}

async function loadDapp() {
  metamaskReloadCallback()
  document.getElementById("web3_message").textContent="Please connect to Metamask"
  var awaitWeb3 = async function () {
    web3 = await getWeb3()
    web3.eth.net.getId((err, netId) => {
      if (netId == NETWORK_ID) {
        var awaitContract = async function () {
          voxGuardContract = await getContract(web3, VOX_GUARD_ADDRESS, VOX_GUARD_ABI_PATH)
          poseidonContract = await getContract(web3, POSEIDON_ADDRESS, POSEIDON_ABI_PATH)
          document.getElementById("web3_message").textContent="You are connected to Metamask"
          onContractInitCallback()
          web3.eth.getAccounts(function(err, _accounts){
            accounts = _accounts
            if (err != null)
            {
              console.error("An error occurred: "+err)
            } else if (accounts.length > 0)
            {
              onWalletConnectedCallback()
              document.getElementById("account_address").style.display = "block"
            } else
            {
              document.getElementById("connect_button").style.display = "block"
            }
          });
        };
        awaitContract();
      } else {
        document.getElementById("web3_message").textContent="Please connect to Amoy";
      }
    });
  };
  awaitWeb3();
}

async function connectWallet() {
  await window.ethereum.request({ method: "eth_requestAccounts" })
  accounts = await web3.eth.getAccounts()
  onWalletConnectedCallback()
}

loadDapp()

const onContractInitCallback = async () => {
  document.getElementById("web3_message").textContent="Reading merkle tree data...";
  leaves = []
  let i =0
  let maxSize = await voxGuardContract.methods.MAX_SIZE().call()
  for(let i=0; i<maxSize; i++)
  {
    leaves.push(await voxGuardContract.methods.commitments(i).call())
  }
  document.getElementById("web3_message").textContent="All ready!";
}

const onWalletConnectedCallback = async () => {
}


//// Functions ////

const deposit = async (depositPrivateKey, depositNullifier) => {
  let commitment = await poseidonContract.methods.poseidon([depositPrivateKey,depositNullifier]).call()

  //let value = await voxGuardContract.methods.NOTE_VALUE().call()

  document.getElementById("web3_message").textContent="Please confirm transaction.";

  const result = await voxGuardContract.methods.deposit(commitment)
    .send({ from: accounts[0], gas: 0 })
    .on('transactionHash', function(hash){
      document.getElementById("web3_message").textContent="Executing...";
    })
  .on('receipt', function(receipt){
    document.getElementById("web3_message").textContent="Success.";    })
  .catch((revertReason) => {
    console.log("ERROR! Transaction reverted: " + revertReason.receipt.transactionHash)
  });
}

const withdraw = async (privateKey, nullifier, recipient) => {
  document.getElementById("web3_message").textContent="Generating proof...";

  let commitment = await poseidonContract.methods.poseidon([privateKey,nullifier]).call()

  let index = null
  for(let i=0; i<leaves.length;i++)
  {
    if(commitment == leaves[i])
    {
      index = i
    }
  }

  if(index == null)
  {
    console.log("Commitment not found in merkle tree")
    return
  }

  let root = await voxGuardContract.methods.root().call()
  let proof = await getWithdrawalProof(index, privateKey, nullifier, recipient, root)

  await sendProofToRelayer(proof.pA, proof.pB, proof.pC, proof.publicSignals)
}

const sendProofToRelayer = async (pA, pB, pC, publicSignals) => {
  fetch(RELAYER_URL + "/relay?pA=" + pA + "&pB=" + pB + "&pC=" + pC + "&publicSignals=" + publicSignals)
  .then(res => res.json())
  .then(out =>
    console.log(out))
  .catch();
}