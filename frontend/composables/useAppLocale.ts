export type AppLocale = "th" | "lo" | "en";

export function useAppLocale() {
	const { locale } = useI18n();
	const localeCode = computed(() => locale.value as AppLocale);
	const intlLocale = computed(() => locale.value === "lo" ? "lo-LA" : locale.value === "en" ? "en-US" : "th-TH");

	return { locale: localeCode, intlLocale };
}
