// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.9.0;

interface IPoseidon {
    function poseidon(uint[2] memory inputs) external returns(uint[1] memory output);
}

interface ICircomVerifier {
    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) external view returns (bool);
}

interface IUSDC {
    function transferFrom(address sender,address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract VoxGuard {

    ICircomVerifier circomVerifier;
    IUSDC usdc; 
    uint nextIndex;
    uint public constant LEVELS = 2;
    uint public constant MAX_SIZE = 4;
    uint public constant NOTE_VALUE = 10000000;
    uint[] public filledSubtrees = new uint[](LEVELS);
    uint[] public emptySubtrees = new uint[](LEVELS);
    address POSEIDON_ADDRESS;
    uint public root;

    mapping(uint => uint) public commitments;
    mapping(uint => bool) public nullifiers;
    mapping(bytes32 => uint256 ) public donationReceiver;

    event Deposit(uint index, uint commitment);
    event DonationReceived(bytes32 indetifier, uint256 amount);

    constructor(address poseidonAddress, address circomVeriferAddress, address _usdc) {
        POSEIDON_ADDRESS = poseidonAddress;
        circomVerifier = ICircomVerifier(circomVeriferAddress);
        usdc = IUSDC(_usdc);

        for (uint32 i = 1; i < LEVELS; i++) {
            emptySubtrees[i] = IPoseidon(POSEIDON_ADDRESS).poseidon([
                emptySubtrees[i-1],
                0
            ])[0];
        }
    }


    function donation(bytes32 _identifier, uint256 _amount) public {
        require(_amount == NOTE_VALUE, "Invalid value sent");
        usdc.transferFrom(msg.sender, address(this), _amount);
        donationReceiver[_identifier] += _amount;
        emit DonationReceived(_identifier,_amount);
    } 

    function deposit(uint commitment) public  {
        require(nextIndex != MAX_SIZE, "Merkle tree is full. No more leaves can be added");
        uint currentIndex = nextIndex;
        uint currentLevelHash = commitment;
        uint left;
        uint right;

        for (uint32 i = 0; i < LEVELS; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = emptySubtrees[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = IPoseidon(POSEIDON_ADDRESS).poseidon([left, right])[0];
            currentIndex /= 2;
        }

        root = currentLevelHash;
        emit Deposit(nextIndex, commitment);
        commitments[nextIndex] = commitment;
        nextIndex = nextIndex + 1;
    }

    function withdraw(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[3] calldata _pubSignals) public {
        circomVerifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        uint nullifierHash = _pubSignals[0];
        uint rootPublicInput = _pubSignals[1];
        address recipient = address(uint160(_pubSignals[2]));

        require(root == rootPublicInput, "Invalid merke root");
        require(!nullifiers[nullifierHash], "already withdraw");

        nullifiers[nullifierHash] = true;
        donationReceiver[_identifier] -= 10000000;

        usdc.transfer(recipient,NOTE_VALUE);
    }
}
