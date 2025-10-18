require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

module.exports = {
    solidity: "0.8.20",
    networks: {
        polygon: {
            url: process.env.POLYGON_RPC_URL || "",
            accounts: process.env.DEPLOY_PRIVATE_KEY ? [process.env.DEPLOY_PRIVATE_KEY] : [],
            chainId: 137,
        },
    },
    etherscan: {
        apiKey: process.env.POLYGONSCAN_API_KEY || "",
    },
};
