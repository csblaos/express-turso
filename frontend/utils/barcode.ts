// CODE128 encoder for receipt reference numbers.
//
// Order numbers look like "POS-20260803-7CB3D7" — letters, digits and hyphens —
// which the EAN-13 encoder used for product labels cannot represent. CODE128
// code set B covers the printable ASCII range, so it takes them as they are.
//
// Written out rather than pulled from a package because a till has to keep
// printing when the internet is down, and this is the whole algorithm.

// Bar/space widths for each of the 107 symbols, as digit strings.
const CODE128_PATTERNS = [
	"212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
	"221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
	"221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
	"212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
	"231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
	"231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
	"314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
	"112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
	"111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
	"214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
	"114131", "311141", "411131", "211412", "211214", "211232", "233111",
];

const START_B = 104;
const STOP = 106;

// Code set B maps printable ASCII 32..126 onto symbols 0..94.
function symbolFor(character: string) {
	const code = character.charCodeAt(0);
	if (code < 32 || code > 126) return null;
	return code - 32;
}

/**
 * Encodes a value as a CODE128-B bit string: "1" is a bar, "0" a space, each
 * character one module wide. Returns null when the value cannot be represented,
 * so callers can simply omit the barcode rather than print a broken one.
 */
export function encodeCode128Bits(value: string): string | null {
	const text = String(value || "").trim();
	if (!text) return null;

	const symbols: number[] = [];
	for (const character of text) {
		const symbol = symbolFor(character);
		if (symbol === null) return null;
		symbols.push(symbol);
	}

	// The check symbol is a position-weighted sum, with the start symbol at
	// weight 1 and each data symbol at its 1-based position.
	let checksum = START_B;
	symbols.forEach((symbol, index) => { checksum += symbol * (index + 1); });
	checksum %= 103;

	const sequence = [ START_B, ...symbols, checksum, STOP ];
	let bits = "";
	for (const symbol of sequence) {
		const pattern = CODE128_PATTERNS[symbol];
		if (!pattern) return null;
		// Widths alternate bar, space, bar, ... starting with a bar.
		for (let index = 0; index < pattern.length; index += 1) {
			bits += (index % 2 === 0 ? "1" : "0").repeat(Number(pattern[index]));
		}
	}
	// Stop pattern carries a final two-module bar that the width table omits.
	return `${bits}11`;
}
