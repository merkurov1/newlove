const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('NeutralHeart - transform flow', function () {
  let NeutralHeart, nh, owner, alice;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
  NeutralHeart = await ethers.getContractFactory('NeutralHeart');
  // deploy with price = 0 for easy testing
  nh = await NeutralHeart.deploy('NeutralHeart', 'NH', 1000, 0);
    // set baseURI to a test value
    await nh.connect(owner).setBaseURI('ipfs://test/');
  });

  it('mints neutral token and transforms to angel', async function () {
    // alice mints 1
    await expect(nh.connect(alice).publicMint(1, { value: 0 }))
      .to.emit(nh, 'PublicMint')
      .withArgs(alice.address, 1);

    // variant should be neutral (0)
    const v1 = await nh.tokenVariant(1);
    expect(v1).to.equal(0);

    // transform token 1 -> variant 1 (angel)
    await expect(nh.connect(alice).transform(1, 1))
      .to.emit(nh, 'Transform')
      .withArgs(alice.address, 1, 2, 1);

    // token 1 should be burned (ownerOf should revert)
    await expect(nh.ownerOf(1)).to.be.reverted;

    // new token 2 exists and belongs to alice
    expect(await nh.ownerOf(2)).to.equal(alice.address);
    expect(await nh.tokenVariant(2)).to.equal(1);
    expect(await nh.tokenURI(2)).to.equal('ipfs://test/angel.json');
  });

  it('can transform to devil as well', async function () {
    // mint another neutral for alice
    await nh.connect(alice).publicMint(1, { value: 0 });
    // transform to devil
    await expect(nh.connect(alice).transform(1, 2))
      .to.emit(nh, 'Transform')
      .withArgs(alice.address, 1, 2, 2);

    expect(await nh.ownerOf(2)).to.equal(alice.address);
    expect(await nh.tokenVariant(2)).to.equal(2);
    expect(await nh.tokenURI(2)).to.equal('ipfs://test/devil.json');
  });
});
