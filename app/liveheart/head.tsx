import React from 'react';

export default function Head() {
  const title = 'LiveHeart — Imprint Your Chaos';
  const description = 'Create and share generative heart artifacts. Interact to generate a unique LiveHeart and save it to share.';

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
    </>
  );
}
