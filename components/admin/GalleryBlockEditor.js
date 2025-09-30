import React, { useState } from 'react';

export default function GalleryBlockEditor({ images, onChange }) {
  const [localImages, setLocalImages] = useState(images || []);

  const handleAdd = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // TODO: upload to server and get URL
    // For now, just use a fake URL
    const url = URL.createObjectURL(file);
    const newImg = { src: url, alt: '' };
    const updated = [...localImages, newImg];
    setLocalImages(updated);
    onChange(updated);
  };

  const handleAltChange = (idx, alt) => {
    const updated = localImages.map((img, i) => i === idx ? { ...img, alt } : img);
    setLocalImages(updated);
    onChange(updated);
  };

  const removeImage = (idx) => {
    const updated = localImages.filter((_, i) => i !== idx);
    setLocalImages(updated);
    onChange(updated);
  };

  return (
    <div>
      <div className="flex gap-2 flex-wrap mb-2">
        {localImages.map((img, i) => (
          <div key={i} className="relative w-32 h-32 border rounded overflow-hidden">
            <img src={img.src} alt={img.alt} className="object-cover w-full h-full" />
            <input
              type="text"
              placeholder="alt"
              value={img.alt}
              onChange={e => handleAltChange(i, e.target.value)}
              className="absolute bottom-0 left-0 w-full bg-white bg-opacity-80 text-xs p-1 border-t"
            />
            <button type="button" onClick={() => removeImage(i)} className="absolute top-0 right-0 bg-red-500 text-white px-1">×</button>
          </div>
        ))}
        <label className="w-32 h-32 border rounded flex items-center justify-center cursor-pointer bg-gray-100">
          +
          <input type="file" accept="image/*" onChange={handleAdd} className="hidden" />
        </label>
      </div>
    </div>
  );
}
