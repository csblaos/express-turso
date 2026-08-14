// A counter during service is loud and nobody is watching the till. A short
// chime is the only signal that actually reaches someone, so "food is ready"
// gets one. Built with WebAudio rather than an audio file: no asset to ship, no
// download to fail, and it plays the instant it is asked to.
const STORAGE_KEY = "restaurant-pos:kitchen-chime";

export function useKitchenChime() {
	const enabled = ref(true);
	let context: AudioContext | null = null;

	onMounted(() => {
		enabled.value = localStorage.getItem(STORAGE_KEY) !== "off";
	});

	function setEnabled(value: boolean) {
		enabled.value = value;
		if (import.meta.client) localStorage.setItem(STORAGE_KEY, value ? "on" : "off");
		if (value) void play();
	}

	async function play() {
		if (!enabled.value || !import.meta.client) return;
		try {
			const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!AudioContextClass) return;
			context = context || new AudioContextClass();
			// Browsers start the context suspended until the page has been interacted
			// with; resuming here means the first chime after a tap works.
			if (context.state === "suspended") await context.resume();
			const start = context.currentTime;
			// Two short notes a fifth apart: recognisable across kitchen noise without
			// sounding like an error.
			for (const [ index, frequency ] of [ 880, 1320 ].entries()) {
				const oscillator = context.createOscillator();
				const gain = context.createGain();
				oscillator.type = "sine";
				oscillator.frequency.value = frequency;
				const at = start + index * 0.16;
				gain.gain.setValueAtTime(0.0001, at);
				gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
				gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
				oscillator.connect(gain).connect(context.destination);
				oscillator.start(at);
				oscillator.stop(at + 0.18);
			}
		} catch {
			// A till with audio blocked still has the badge and the list; a silent
			// failure here must never break the screen.
		}
	}

	return { enabled, setEnabled, play };
}
