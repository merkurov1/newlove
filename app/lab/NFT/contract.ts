export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_NEUTRAL_HEART_ADDRESS || "0x0000000000000000000000000000000000000000";

// Minimal ABI consisting of used methods
export const NFT_ABI = [
    "function priceWei() view returns (uint256)",
    "function maxPublicSupply() view returns (uint256)",
    "function publicMint(uint256 qty) payable",
    "function publicMinted() view returns (uint256)",
    "function claimForSubscriber(bytes signature)",
];
