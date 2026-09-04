"use client";

/**
 * Real audio for the visualiser.
 *
 * YouTube plays in a cross-origin iframe, so `createMediaElementSource` is out
 * — the page has no media element and no same-origin audio to tap. The only
 * route the web platform offers is capturing the tab's own output with
 * `getDisplayMedia({ audio: true })` and running that through an AnalyserNode.
 *
 * That needs a permission prompt, so it is opt-in and off by default. When it
 * is off the visualiser falls back to drawing the mix from deck gains, which is
 * honest but is not the audio.
 *
 * Chrome and Edge only: Safari and Firefox cannot capture tab audio.
 */

export type ListenStatus = "idle" | "starting" | "live" | "unsupported" | "error";

const FFT_SIZE = 256;

let status: ListenStatus = "idle";
let message: string | null = null;

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let stream: MediaStream | null = null;
let spectrum: Uint8Array<ArrayBuffer> | null = null;

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function set(next: ListenStatus, note: string | null = null) {
  status = next;
  message = note;
  emit();
}

export function subscribeListen(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function getListenStatus(): ListenStatus {
  return status;
}

export function getListenMessage(): string | null {
  return message;
}

export function canListen(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof window.AudioContext === "function"
  );
}

/** Fills and returns the current frequency data, or null when not listening. */
export function readSpectrum(): Uint8Array<ArrayBuffer> | null {
  if (!analyser || !spectrum) return null;
  analyser.getByteFrequencyData(spectrum);
  return spectrum;
}

export async function startListening() {
  if (status === "live" || status === "starting") return;

  if (!canListen()) {
    set("unsupported", "Your browser can't share tab sound. Chrome or Edge can.");
    return;
  }

  set("starting");

  try {
    // Chrome refuses audio-only capture, so video has to be requested and is
    // then dropped. `preferCurrentTab` puts this tab at the top of the picker.
    const options = {
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Explicit: capture is a tap, not a redirect. Left at Chrome's default
        // this is already false, but stating it guarantees enabling the ear can
        // never silence the music the room is listening to.
        suppressLocalAudioPlayback: false,
      },
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      systemAudio: "include",
    } as unknown as DisplayMediaStreamOptions;

    const captured = await navigator.mediaDevices.getDisplayMedia(options);
    const [audioTrack] = captured.getAudioTracks();

    if (!audioTrack) {
      captured.getTracks().forEach((track) => track.stop());
      set("error", "Pick this tab and switch on “Also share tab audio”.");
      return;
    }

    // The video track is only there to satisfy the picker.
    captured.getVideoTracks().forEach((track) => track.stop());

    stream = captured;
    context = new AudioContext();
    await context.resume();

    analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    // Smooths the bars without adding latency the eye can catch.
    analyser.smoothingTimeConstant = 0.72;
    spectrum = new Uint8Array(analyser.frequencyBinCount);

    // Deliberately not connected to `context.destination`: capture is a tap,
    // the tab keeps playing on its own, and connecting would double the audio.
    context.createMediaStreamSource(captured).connect(analyser);

    // Chrome's own "Stop sharing" bar ends the track behind our back.
    audioTrack.addEventListener("ended", stopListening);

    set("live");
  } catch (error) {
    const denied = error instanceof DOMException && error.name === "NotAllowedError";
    set("error", denied ? "No sound shared, so the hair is showing the mix." : "Couldn't hear the tab.");
  }
}

export function stopListening() {
  stream?.getTracks().forEach((track) => track.stop());
  void context?.close();
  stream = null;
  context = null;
  analyser = null;
  spectrum = null;
  set("idle");
}
