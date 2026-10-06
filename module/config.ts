/** Named settings for the genre lookup and audio fallback (spec §4). */

export const audioMinConfidence = 0.15, audioTopK = 3, durationToleranceS = 5;
export const musicbrainzTtlDays = 30, audioRecheckDays = 14, notFoundTtlDays = 7;
export const deezerBudget = 40, deezerWindowMs = 5000, musicbrainzBudget = 1, musicbrainzWindowMs = 1000;
export const backoffInitialMs = 5000, backoffMaxMs = 60000;

export const MODEL_REPO = "Heyian/discogs-effnet-onnx";
export const MODEL_REVISION = "99d4b0ef1fd5d798f2afe049285c7d551e768e07"; // Hugging Face commit
export const MODEL_SHA256 = "a280825b334797cf677939db8cd5762c0392aedd0ca6415dbc1cd083f045e43c";
export const MODEL_VERSION = "discogs-effnet-bsdynamic-1";
export const ORT_VERSION = "1.30.0";

export const AUDIO_FALLBACK_STORAGE_KEY = "showGenre:audioFallback";
export const INFERRED_TITLE = "Inferred from audio (MTG Discogs-EffNet, CC BY-NC-SA 4.0)";
export const DAY_MS = 86_400_000;

export const modelPinned = (): boolean => (MODEL_REVISION as string) !== "" && (MODEL_SHA256 as string) !== "";
