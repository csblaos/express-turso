// Shape of one card in a report tab's summary row. Shared by the page that
// builds the cards and the component that draws them.
export type SummaryCardDelta = { text: string; positive: boolean };

export type SummaryCard = {
	key: string;
	label: string;
	value: string;
	// Small grey line under the value: what the figure covers.
	hint?: string;
	// Same slot, but tinted with the card - used when the number needs a warning.
	note?: string;
	tone?: "amber" | "";
	badge?: string;
	badgeTitle?: string;
	delta?: SummaryCardDelta | null;
	actionLabel?: string;
	actionDisabled?: boolean;
};
