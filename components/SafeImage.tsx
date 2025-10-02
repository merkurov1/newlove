'use client';'use client';'use client';



import Image from 'next/image';

import { useState } from 'react';

import Image from 'next/image';import Image from 'next/image';

interface SafeImageProps {

  src: string;import { useState } from 'react';import { useState, useEffect } from 'react';

  alt: string;

  fill?: boolean;

  sizes?: string;

  className?: string;interface SafeImageProps {interface SafeImageProps {

  width?: number;

  height?: number;  src: string;  src: string;

  priority?: boolean;

}  alt: string;  alt: string;



export default function SafeImage(props: SafeImageProps) {  fill?: boolean;  fill?: boolean;

  const [imageError, setImageError] = useState(false);

  sizes?: string;  sizes?: string;

  const handleError = () => {

    setImageError(true);  className?: string;  className?: string;

  };

  width?: number;  width?: number;

  if (imageError) {

    if (props.fill) {  height?: number;  height?: number;

      return (

        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg">  priority?: boolean;}

          <div className="text-center p-4">

            <div className="text-4xl text-gray-300 mb-2">📄</div>}

            <p className="text-sm text-gray-400">Изображение не загружено</p>

          </div>export default function SafeImage({ src, alt, fill, sizes, className, width, height }: SafeImageProps) {

        </div>

      );export default function SafeImage({ src, alt, fill, sizes, className, width, height, priority }: SafeImageProps) {  const [imageError, setImageError] = useState(false);

    }

      const [imageError, setImageError] = useState(false);  const [currentSrc, setCurrentSrc] = useState(src);

    return (

      <div   const [retryCount, setRetryCount] = useState(0);

        className={`bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg ${props.className || ''}`}

        style={{ width: props.width, height: props.height }}  const handleError = () => {

      >

        <div className="text-center p-4">    console.log('Image failed to load:', src);  // Сбрасываем состояние при изменении src

          <div className="text-4xl text-gray-300 mb-2">📄</div>

          <p className="text-sm text-gray-400">Изображение не загружено</p>    setImageError(true);  useEffect(() => {

        </div>

      </div>  };    setImageError(false);

    );

  }    setRetryCount(0);



  return (  if (imageError) {    setCurrentSrc(src);

    <Image

      src={props.src}    // Для fill режима  }, [src]);

      alt={props.alt}

      fill={props.fill}    if (fill) {

      sizes={props.sizes}

      width={props.width}      return (  const handleError = () => {

      height={props.height}

      className={props.className}        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg">    console.log('SafeImage error for:', currentSrc, 'retry:', retryCount);

      priority={props.priority}

      onError={handleError}          <div className="text-center p-4">    

    />

  );            <div className="text-4xl text-gray-300 mb-2">📄</div>    // Пробуем перезагрузить до 1 раза

}
            <p className="text-sm text-gray-400">Изображение не загружено</p>    if (retryCount < 1) {

          </div>      const newRetryCount = retryCount + 1;

        </div>      setRetryCount(newRetryCount);

      );      

    }      setTimeout(() => {

            const newSrc = src.includes('?') ? `${src}&retry=${newRetryCount}` : `${src}?retry=${newRetryCount}`;

    // Для обычного режима        console.log('SafeImage retrying:', newSrc);

    return (        setCurrentSrc(newSrc);

      <div       }, 1000);

        className={`bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg ${className || ''}`}      return;

        style={{ width, height }}    }

      >    

        <div className="text-center p-4">    setImageError(true);

          <div className="text-4xl text-gray-300 mb-2">📄</div>  };

          <p className="text-sm text-gray-400">Изображение не загружено</p>

        </div>  if (imageError) {

      </div>    // Для fill режима возвращаем абсолютно позиционированный элемент

    );    if (fill) {

  }      return (

        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg">

  return (          <div className="text-center p-4">

    <Image            <div className="text-4xl text-gray-300 mb-2">📄</div>

      src={src}            <p className="text-sm text-gray-400">Изображение не загружено</p>

      alt={alt}          </div>

      fill={fill}        </div>

      sizes={sizes}      );

      width={width}    }

      height={height}    

      className={className}    // Для обычного режима возвращаем блок с размерами

      priority={priority}    return (

      onError={handleError}      <div 

    />        className={`bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg ${className || ''}`}

  );        style={{ width, height }}

}      >
        <div className="text-center p-4">
          <div className="text-4xl text-gray-300 mb-2">📄</div>
          <p className="text-sm text-gray-400">Изображение не загружено</p>
        </div>
      </div>
    );
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      fill={fill}
      sizes={sizes}
      width={width}
      height={height}
      className={className}
      onError={handleError}
    />
  );
}
