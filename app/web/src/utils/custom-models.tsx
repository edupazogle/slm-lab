// From the vendored wllama examples/main (MIT, ngxson/wllama @ 46af429): validates a model URL the person typed by a
// ranged fetch of the GGUF magic bytes, then sums the size of every shard by HEAD. Changes: the debugging
// `window._exportModelList` hook was removed; errors are plain sentences; returns a plain record.
const ggufMagicNumber = new Uint8Array([0x47, 0x47, 0x55, 0x46]);

export interface VerifiedModel {
  url: string;
  size: number;
}

export async function verifyCustomModel(url: string): Promise<VerifiedModel> {
  const _url = url.trim().replace(/\?.*/, '');
  if (!/^https:\/\/(huggingface\.co|hf\.co)\/.+\.gguf$/i.test(_url)) {
    throw new Error('Use a Hugging Face file link that ends in .gguf (https://huggingface.co/<owner>/<repo>/resolve/main/<file>.gguf).');
  }

  const response = await fetch(_url, {
    headers: {
      Range: `bytes=0-${2 * 1024 * 1024}`,
    },
  });

  if (response.ok) {
    const buf = await response.arrayBuffer();
    if (!checkBuffer(new Uint8Array(buf.slice(0, 4)), ggufMagicNumber)) {
      throw new Error('That file is not a GGUF model: it does not start with the GGUF signature.');
    }
  } else {
    throw new Error(`Hugging Face answered HTTP ${response.status} for that link.`);
  }

  return { url: _url, size: await getModelSize(_url) };
}

const checkBuffer = (buffer: Uint8Array, header: Uint8Array) => {
  for (let i = 0; i < header.length; i++) {
    if (header[i] !== buffer[i]) {
      return false;
    }
  }
  return true;
};

const getModelSize = async (url: string): Promise<number> => {
  const urls = parseModelUrl(url);

  const sizes = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, {
        method: 'HEAD',
      });

      if (response.ok) {
        const contentLength = response.headers.get('Content-Length');
        if (contentLength) {
          return parseInt(contentLength);
        } else {
          return 0;
        }
      } else {
        throw new Error(`Hugging Face answered HTTP ${response.status} for ${url.split('/').pop()}.`);
      }
    })
  );

  return sumArr(sizes);
};

const parseModelUrl = (modelUrl: string): string[] => {
  const urlPartsRegex = /(?<baseURL>.*)-(?<current>\d{5})-of-(?<total>\d{5})\.gguf$/;
  const matches = modelUrl.match(urlPartsRegex);
  if (!matches || !matches.groups || Object.keys(matches.groups).length !== 3) {
    return [modelUrl];
  }
  const { baseURL, total } = matches.groups;
  const paddedShardIds = Array.from({ length: Number(total) }, (_, index) =>
    (index + 1).toString().padStart(5, '0')
  );
  return paddedShardIds.map((current) => `${baseURL}-${current}-of-${total}.gguf`);
};

const sumArr = (arr: number[]) => arr.reduce((sum, num) => sum + num, 0);
