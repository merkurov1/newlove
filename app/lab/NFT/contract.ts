// Default to the most recent deployed address (can be overridden by NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS)
// Updated to the most recently deployed contract (deployed 2025-10-19)
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS || "0x6b9141E0224B893E6b6864B741DfE19Dd1d3e790";

// Expanded minimal ABI used by the client page
export const NFT_ABI = [
    "function priceWei() view returns (uint256)",
    "function maxPublicSupply() view returns (uint256)",
    "function publicMint(uint256 qty) payable",
    "function publicMinted() view returns (uint256)",
    "function tokenURI(uint256) view returns (string)",
    "function claimForSubscriber(bytes signature)",
    "function hasClaimedOnChain(address) view returns (bool)",
    "function currentId() view returns (uint256)",
    // transform: burn neutral token and mint a new token with variant (0=neutral,1=angel,2=devil)
    "function transform(uint256,uint8)",
    "function tokenVariant(uint256) view returns (uint8)",
    // owner helpers
    "function owner() view returns (address)",
    "function setBaseURI(string)"
];
