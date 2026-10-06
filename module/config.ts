/** Named settings for the genre lookup and audio fallback (spec §4). */

export const audioMinConfidence = 0.15, audioTopK = 3, durationToleranceS = 5;
export const musicbrainzTtlDays = 30, audioRecheckDays = 14, notFoundTtlDays = 7;
export const deezerBudget = 40, deezerWindowMs = 5000, musicbrainzBudget = 1, musicbrainzWindowMs = 1000;
export const backoffInitialMs = 5000, backoffMaxMs = 60000;

export const MODEL_REPO = "<hf-user>/discogs-effnet-onnx"; // filled after Manual Operator Step 5
export const MODEL_REVISION = ""; // Hugging Face commit SHA, Manual Operator Step 5
export const MODEL_SHA256 = ""; // Manual Operator Step 1
export const MODEL_VERSION = "discogs-effnet-bsdynamic-1";
export const ORT_VERSION = "1.30.0";

export const AUDIO_FALLBACK_STORAGE_KEY = "showGenre:audioFallback";
export const INFERRED_TITLE = "Inferred from audio (MTG Discogs-EffNet, CC BY-NC-SA 4.0)";
export const DAY_MS = 86_400_000;

export const modelPinned = (): boolean => MODEL_REVISION !== "" && MODEL_SHA256 !== "";
