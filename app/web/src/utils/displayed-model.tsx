// Adapted from the vendored wllama examples/main (MIT, ngxson/wllama @ 46af429): the model row the UI shows, merged
// from the curated list in config.ts, the models the person added by URL, and what is already in the browser's cache.
import { Model } from '@wllama/wllama';
import { ModelState } from './types';
import { WllamaStorage } from './utils';
import { LAB_MODE, LIST_MODELS, ListedModel, ModelTier, tierOf } from '../config';
import { modelDisplayName } from './format';

export class DisplayedModel {
  url: string;
  mmprojUrl?: string;
  size: number;
  isUserAdded: boolean;
  modalities?: ('image' | 'audio')[];
  cachedModel?: Model;
  /** curated notes; undefined for a model the person added by URL */
  info?: ListedModel;

  state: ModelState = ModelState.NOT_DOWNLOADED;
  /** bytes received so far while downloading; -1 when not downloading */
  downloadLoaded = -1;
  downloadTotal = 0;

  constructor(
    url: string,
    size: number,
    isUserAdded: boolean,
    cachedModel?: Model,
    mmprojUrl?: string,
    modalities?: ('image' | 'audio')[],
    info?: ListedModel
  ) {
    this.url = url;
    this.mmprojUrl = mmprojUrl;
    this.size = size;
    this.isUserAdded = isUserAdded;
    this.modalities = modalities;
    this.info = info;
    this.state = cachedModel ? ModelState.READY : ModelState.NOT_DOWNLOADED;
    this.cachedModel = cachedModel;
  }

  get name(): string {
    return this.info?.name ?? modelDisplayName(this.url);
  }

  get tier(): ModelTier {
    return tierOf(this.size);
  }

  get hfRepo(): string {
    const parts = this.url.replace(/https:\/\/(huggingface.co|hf.co)\/+/, '').split('/');
    return `${parts[0]}/${parts[1]}`;
  }

  get fileName(): string {
    return decodeURIComponent(this.url.split('/').pop() ?? this.url).replace(/-\d{5}-of-(\d{5})\.gguf$/, ' ($1 parts)');
  }

  get downloadPercent(): number {
    if (this.downloadLoaded < 0) return -1;
    const total = this.downloadTotal || this.size;
    return total > 0 ? Math.min(1, this.downloadLoaded / total) : 0;
  }

  clone(overwrite: Partial<Pick<DisplayedModel, 'state' | 'downloadLoaded' | 'downloadTotal'>>): DisplayedModel {
    const obj = new DisplayedModel(
      this.url,
      this.size,
      this.isUserAdded,
      this.cachedModel,
      this.mmprojUrl,
      this.modalities,
      this.info
    );
    obj.state = overwrite.state ?? this.state;
    obj.downloadLoaded = overwrite.downloadLoaded ?? this.downloadLoaded;
    obj.downloadTotal = overwrite.downloadTotal ?? this.downloadTotal;
    return obj;
  }
}

interface UserAddedModel {
  url: string;
  size: number;
  mmprojUrl?: string;
}

export function getUserAddedModels(cachedModels: Model[]): DisplayedModel[] {
  const userAddedModels: UserAddedModel[] = WllamaStorage.load('custom_models', []);
  return userAddedModels.map((m) => {
    const cachedModel = cachedModels.find((cm) => cm.url === m.url);
    return new DisplayedModel(m.url, m.size, true, cachedModel, m.mmprojUrl);
  });
}

export function updateUserAddedModels(models: DisplayedModel[]) {
  const userAddedModels: UserAddedModel[] = models
    .filter((m) => m.isUserAdded)
    .map((m) => ({ url: m.url, size: m.size, mmprojUrl: m.mmprojUrl }));
  WllamaStorage.save('custom_models', userAddedModels);
}

export function getPresetModels(cachedModels: Model[]): DisplayedModel[] {
  return LIST_MODELS.flatMap((m) => {
    const cachedModel = cachedModels.find((cm) => cm.url === m.url);
    // A lab-only model is left out without ?lab=1, except when its file is already on this device: then it stays on
    // the Models screen, so the file can still be seen and deleted rather than sit in storage where nothing shows it.
    if (m.labOnly && !LAB_MODE && !cachedModel) return [];
    return [new DisplayedModel(m.url, m.size, false, cachedModel, m.mmprojUrl, m.modalities, m)];
  });
}

/**
 * Whether the chat may propose this model on its own (the first-run button, "Load the last model"). A lab-only model
 * that is listed only because it is on this device can still be loaded from the Models screen, but is never offered.
 */
export const isOfferable = (m: DisplayedModel): boolean => LAB_MODE || !m.info?.labOnly;

export function getDisplayedModels(cachedModels: Model[]): DisplayedModel[] {
  return [...getUserAddedModels(cachedModels), ...getPresetModels(cachedModels)];
}
