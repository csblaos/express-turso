// The banks a Lao shop is likely to hold an account with, for the account picker
// on the payment-settings page.
//
// bank_name stays free text in the database: this list only makes the common
// cases a two-click choice, and a shop banking somewhere not listed can still
// type its own name.
export type LaoBank = { code: string; name: string; logo: string };

export const LAO_BANKS: LaoBank[] = [
	{ code: "BCEL", name: "BANQUE POUR LE COMMERCE EXTERIEUR LAO PUBLIC", logo: "/images/BCEL.png" },
	{ code: "LDB", name: "Lao Development Bank Co., Ltd", logo: "/images/LDB.png" },
	{ code: "APB", name: "Agricultural Promotion Bank Co., Ltd.", logo: "/images/APB.png" },
	{ code: "JDB", name: "Joint Development Bank Public", logo: "/images/JDB.png" },
	{ code: "STB", name: "ST Bank Ltd.", logo: "/images/STB.png" },
	{ code: "IDB", name: "INDOCHINA BANK LTD", logo: "/images/IDB.jpeg" },
	{ code: "PSV", name: "PHONGSAVANH BANK LTD", logo: "/images/PSV.jpeg" },
	{ code: "MJBL", name: "MARUHAN Japan Bank Lao Co., Ltd.", logo: "/images/MJBL.jpeg" },
];

// Matches on the stored name, then on the short code, so an account saved before
// this list existed still shows its logo when the name happens to line up.
export function findLaoBank(bankName: string | null | undefined): LaoBank | null {
	const value = String(bankName || "").trim().toLowerCase();
	if (!value) return null;
	return LAO_BANKS.find((bank) => bank.name.toLowerCase() === value)
		|| LAO_BANKS.find((bank) => bank.code.toLowerCase() === value)
		|| null;
}
