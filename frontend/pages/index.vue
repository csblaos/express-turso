<script setup lang="ts">
type ServiceMode = "Dine in" | "Take away" | "Delivery";

type Category = {
	id: string;
	label: string;
	description: string;
};

type Product = {
	id: string;
	name: string;
	category: string;
	price: number;
	prepTime: string;
	stockLabel: string;
	tag?: string;
	accent: string;
};

type CartEntry = {
	productId: string;
	qty: number;
};

const serviceModes: ServiceMode[] = ["Dine in", "Take away", "Delivery"];

const categories: Category[] = [
	{ id: "all", label: "All items", description: "Everything on the menu" },
	{ id: "signature", label: "Signature", description: "Fast-moving favorites" },
	{ id: "coffee", label: "Coffee", description: "Hot and iced espresso drinks" },
	{ id: "tea", label: "Tea", description: "Milk tea and fruit refreshers" },
	{ id: "bakery", label: "Bakery", description: "Fresh pastries and dessert" },
	{ id: "addons", label: "Add-ons", description: "Toppings and quick extras" },
];

const products: Product[] = [
	{
		id: "latte",
		name: "House Latte",
		category: "coffee",
		price: 95,
		prepTime: "3 min",
		stockLabel: "Ready",
		tag: "Best seller",
		accent: "linear-gradient(135deg, #f7d5b3 0%, #d86d32 100%)",
	},
	{
		id: "americano",
		name: "Long Black",
		category: "coffee",
		price: 80,
		prepTime: "2 min",
		stockLabel: "Ready",
		accent: "linear-gradient(135deg, #f1e8da 0%, #7b5b3f 100%)",
	},
	{
		id: "matcha",
		name: "Cloud Matcha",
		category: "tea",
		price: 110,
		prepTime: "4 min",
		stockLabel: "Ready",
		tag: "New",
		accent: "linear-gradient(135deg, #edf6d2 0%, #6f9f50 100%)",
	},
	{
		id: "thai-tea",
		name: "Thai Milk Tea",
		category: "tea",
		price: 90,
		prepTime: "3 min",
		stockLabel: "Ready",
		accent: "linear-gradient(135deg, #ffe0b2 0%, #db7d25 100%)",
	},
	{
		id: "croffle",
		name: "Butter Croffle",
		category: "bakery",
		price: 85,
		prepTime: "5 min",
		stockLabel: "6 left",
		accent: "linear-gradient(135deg, #f9e9d0 0%, #c9964d 100%)",
	},
	{
		id: "cheesecake",
		name: "Burnt Cheesecake",
		category: "bakery",
		price: 125,
		prepTime: "Ready",
		stockLabel: "4 left",
		tag: "Limited",
		accent: "linear-gradient(135deg, #f8d6d3 0%, #b7645f 100%)",
	},
	{
		id: "sparkling-yuzu",
		name: "Sparkling Yuzu",
		category: "signature",
		price: 105,
		prepTime: "2 min",
		stockLabel: "Ready",
		accent: "linear-gradient(135deg, #fff0bf 0%, #d9ae2a 100%)",
	},
	{
		id: "avocado-toast",
		name: "Avocado Toast",
		category: "signature",
		price: 160,
		prepTime: "8 min",
		stockLabel: "Ready",
		accent: "linear-gradient(135deg, #d7f1dd 0%, #4d9e82 100%)",
	},
	{
		id: "extra-shot",
		name: "Extra Espresso Shot",
		category: "addons",
		price: 20,
		prepTime: "Instant",
		stockLabel: "Always",
		accent: "linear-gradient(135deg, #e6ddd4 0%, #8d6d53 100%)",
	},
	{
		id: "oat-milk",
		name: "Oat Milk Swap",
		category: "addons",
		price: 25,
		prepTime: "Instant",
		stockLabel: "Always",
		accent: "linear-gradient(135deg, #f5e5c5 0%, #c59756 100%)",
	},
];

const searchQuery = ref("");
const activeCategory = ref("all");
const activeMode = ref<ServiceMode>("Dine in");
const currentTicket = ref("A-102");
const orderNote = ref("Less sugar on tea items");
const cart = ref<CartEntry[]>([
	{ productId: "latte", qty: 1 },
	{ productId: "croffle", qty: 2 },
]);

const numberFormatter = new Intl.NumberFormat("th-TH", {
	style: "currency",
	currency: "THB",
	maximumFractionDigits: 0,
});

const productMap = computed(() =>
	Object.fromEntries(products.map((product) => [product.id, product])),
);

const featuredCounts = computed(() =>
	categories.reduce<Record<string, number>>((result, category) => {
		if (category.id === "all") {
			result[category.id] = products.length;
			return result;
		}

		result[category.id] = products.filter((product) => product.category === category.id).length;
		return result;
	}, {}),
);

const filteredProducts = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();

	return products.filter((product) => {
		const categoryMatch =
			activeCategory.value === "all" || product.category === activeCategory.value;
		const textMatch =
			query.length === 0 ||
			product.name.toLowerCase().includes(query) ||
			product.tag?.toLowerCase().includes(query);

		return categoryMatch && textMatch;
	});
});

const cartItems = computed(() =>
	cart.value
		.map((entry) => {
			const product = productMap.value[entry.productId];

			if (!product) {
				return null;
			}

			return {
				...product,
				qty: entry.qty,
				lineTotal: product.price * entry.qty,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null),
);

const itemCount = computed(() =>
	cartItems.value.reduce((sum, item) => sum + item.qty, 0),
);

const subtotal = computed(() =>
	cartItems.value.reduce((sum, item) => sum + item.lineTotal, 0),
);

const tax = computed(() => Math.round(subtotal.value * 0.07));
const serviceCharge = computed(() => (activeMode.value === "Dine in" ? 20 : 0));
const total = computed(() => subtotal.value + tax.value + serviceCharge.value);

const orderStats = computed(() => [
	{ label: "Queued", value: "08", tone: "bg-brand-50 text-brand-700" },
	{ label: "Ready", value: "05", tone: "bg-mint-100 text-emerald-800" },
	{ label: "Avg ticket", value: numberFormatter.format(184), tone: "bg-berry-100 text-rose-800" },
]);

function formatMoney(value: number) {
	return numberFormatter.format(value);
}

function addToCart(product: Product) {
	const existing = cart.value.find((entry) => entry.productId === product.id);

	if (existing) {
		existing.qty += 1;
		return;
	}

	cart.value.unshift({ productId: product.id, qty: 1 });
}

function increaseQty(productId: string) {
	const entry = cart.value.find((item) => item.productId === productId);

	if (entry) {
		entry.qty += 1;
	}
}

function decreaseQty(productId: string) {
	const entry = cart.value.find((item) => item.productId === productId);

	if (!entry) {
		return;
	}

	if (entry.qty === 1) {
		cart.value = cart.value.filter((item) => item.productId !== productId);
		return;
	}

	entry.qty -= 1;
}

function clearCart() {
	cart.value = [];
}
</script>

<template>
	<main class="min-h-screen">
		<div class="mx-auto flex min-h-screen max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
			<header
				class="rounded-[28px] border border-stone-900/10 bg-pos-glow px-4 py-4 shadow-panel backdrop-blur xl:px-6"
			>
				<div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
					<div class="space-y-3">
						<div class="flex flex-wrap items-center gap-3">
							<span
								class="inline-flex items-center rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-50"
							>
								POS starter
							</span>
							<span class="rounded-full bg-white/80 px-3 py-1 text-sm text-stone-600">
								Ticket {{ currentTicket }}
							</span>
							<span class="rounded-full bg-white/80 px-3 py-1 text-sm text-stone-600">
								Tablet + desktop + mobile
							</span>
						</div>

						<div>
							<h1 class="max-w-3xl text-3xl font-semibold tracking-[-0.04em] text-ink sm:text-4xl xl:text-5xl">
								Front counter POS UI ที่เน้นความเร็วในการกดขายและอ่านง่ายทุกขนาดจอ
							</h1>
							<p class="mt-3 max-w-2xl text-sm leading-7 text-mist sm:text-base">
								รอบนี้เป็น starter shell สำหรับรีวิวทิศทาง visual, spacing, responsive
								layout และ ticket panel ก่อน ยังไม่เชื่อม payment flow หรือ backend จริง
							</p>
						</div>
					</div>

					<div class="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
						<div
							v-for="stat in orderStats"
							:key="stat.label"
							class="rounded-3xl border border-white/70 bg-white/85 p-4"
						>
							<p class="text-xs uppercase tracking-[0.22em] text-stone-500">
								{{ stat.label }}
							</p>
							<p class="mt-3 inline-flex rounded-full px-3 py-1 text-lg font-semibold" :class="stat.tone">
								{{ stat.value }}
							</p>
						</div>
					</div>
				</div>

				<div class="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
					<label
						class="flex items-center gap-3 rounded-3xl border border-stone-900/10 bg-white/85 px-4 py-3 shadow-sm"
					>
						<span class="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
							Search
						</span>
						<input
							v-model="searchQuery"
							type="text"
							placeholder="Search drink, bakery, tag..."
							class="w-full border-0 bg-transparent text-sm text-stone-700 outline-none placeholder:text-stone-400"
						/>
					</label>

					<div class="grid grid-cols-3 gap-2 rounded-3xl bg-stone-900 p-1">
						<button
							v-for="mode in serviceModes"
							:key="mode"
							type="button"
							class="rounded-[18px] px-4 py-3 text-sm font-medium transition"
							:class="
								activeMode === mode
									? 'bg-white text-stone-900 shadow-sm'
									: 'text-stone-300 hover:bg-white/10 hover:text-white'
							"
							@click="activeMode = mode"
						>
							{{ mode }}
						</button>
					</div>
				</div>
			</header>

			<div class="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
				<section class="space-y-4">
					<div class="rounded-[28px] border border-stone-900/10 bg-white/80 p-4 shadow-panel backdrop-blur xl:p-5">
						<div class="flex items-center justify-between gap-3">
							<div>
								<p class="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
									Categories
								</p>
								<h2 class="mt-2 text-xl font-semibold tracking-[-0.03em] text-ink">
									Quick product browsing
								</h2>
							</div>
							<p class="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-500">
								{{ filteredProducts.length }} items
							</p>
						</div>

						<div class="scrollbar-soft mt-4 flex gap-3 overflow-x-auto pb-2">
							<button
								v-for="category in categories"
								:key="category.id"
								type="button"
								class="min-w-[190px] rounded-[24px] border px-4 py-4 text-left transition"
								:class="
									activeCategory === category.id
										? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
										: 'border-stone-200 bg-stone-50/70 text-stone-700 hover:border-stone-300 hover:bg-white'
								"
								@click="activeCategory = category.id"
							>
								<div class="flex items-center justify-between gap-3">
									<p class="font-semibold">{{ category.label }}</p>
									<span class="rounded-full bg-white/90 px-2.5 py-1 text-xs text-stone-500">
										{{ featuredCounts[category.id] }}
									</span>
								</div>
								<p class="mt-2 text-sm leading-6 text-stone-500">
									{{ category.description }}
								</p>
							</button>
						</div>
					</div>

					<div class="rounded-[28px] border border-stone-900/10 bg-white/80 p-4 shadow-panel backdrop-blur xl:p-5">
						<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
							<div>
								<p class="text-xs font-semibold uppercase tracking-[0.22em] text-stone-400">
									Product grid
								</p>
								<h2 class="mt-2 text-xl font-semibold tracking-[-0.03em] text-ink">
									Starter layout สำหรับหน้าขายหน้าร้าน
								</h2>
							</div>
							<p class="max-w-md text-sm leading-6 text-stone-500">
								ตั้งใจให้ card ใหญ่พอกดบน tablet, ข้อมูลสำคัญอยู่บน fold และระยะห่างยังอ่านง่ายบน mobile
							</p>
						</div>

						<div class="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
							<button
								v-for="product in filteredProducts"
								:key="product.id"
								type="button"
								class="group overflow-hidden rounded-[26px] border border-stone-200 bg-stone-50 text-left transition hover:-translate-y-0.5 hover:border-stone-300 hover:bg-white"
								@click="addToCart(product)"
							>
								<div class="h-28 p-4" :style="{ background: product.accent }">
									<div class="flex items-start justify-between gap-3">
										<span
											class="rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-700"
										>
											{{ product.category }}
										</span>
										<span
											v-if="product.tag"
											class="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white"
										>
											{{ product.tag }}
										</span>
									</div>
								</div>

								<div class="space-y-4 p-4">
									<div>
										<h3 class="text-lg font-semibold tracking-[-0.03em] text-ink">
											{{ product.name }}
										</h3>
										<p class="mt-2 text-sm leading-6 text-stone-500">
											Prep {{ product.prepTime }} . {{ product.stockLabel }}
										</p>
									</div>

									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-xs uppercase tracking-[0.2em] text-stone-400">
												Price
											</p>
											<p class="mt-1 text-lg font-semibold text-ink">
												{{ formatMoney(product.price) }}
											</p>
										</div>
										<span
											class="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition group-hover:bg-brand-600"
										>
											Add to ticket
										</span>
									</div>
								</div>
							</button>
						</div>
					</div>
				</section>

				<aside class="xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
					<div class="flex h-full flex-col rounded-[30px] border border-stone-900/10 bg-stone-950 p-4 text-stone-50 shadow-float">
						<div class="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
							<div>
								<p class="text-xs uppercase tracking-[0.22em] text-stone-400">
									Active ticket
								</p>
								<h2 class="mt-2 text-2xl font-semibold tracking-[-0.04em]">
									{{ currentTicket }}
								</h2>
								<p class="mt-2 text-sm leading-6 text-stone-400">
									{{ activeMode }} . {{ itemCount }} items
								</p>
							</div>

							<button
								type="button"
								class="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-stone-300 transition hover:border-white/30 hover:text-white"
								@click="clearCart"
							>
								Clear
							</button>
						</div>

						<div class="mt-4 rounded-[24px] bg-white/5 p-4">
							<p class="text-xs uppercase tracking-[0.22em] text-stone-400">
								Cashier note
							</p>
							<p class="mt-2 text-sm leading-6 text-stone-200">
								{{ orderNote }}
							</p>
						</div>

						<div class="scrollbar-soft mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
							<div
								v-for="item in cartItems"
								:key="item.id"
								class="rounded-[24px] border border-white/10 bg-white/5 p-4"
							>
								<div class="flex items-start justify-between gap-4">
									<div>
										<h3 class="font-semibold">{{ item.name }}</h3>
										<p class="mt-1 text-sm text-stone-400">
											{{ formatMoney(item.price) }} each
										</p>
									</div>
									<p class="text-right text-sm font-medium text-stone-200">
										{{ formatMoney(item.lineTotal) }}
									</p>
								</div>

								<div class="mt-4 flex items-center justify-between gap-3">
									<div class="inline-flex items-center rounded-full bg-black/30 p-1">
										<button
											type="button"
											class="rounded-full px-3 py-2 text-sm text-stone-300 transition hover:bg-white/10 hover:text-white"
											@click="decreaseQty(item.id)"
										>
											-
										</button>
										<span class="min-w-[2.5rem] text-center text-sm font-semibold">
											{{ item.qty }}
										</span>
										<button
											type="button"
											class="rounded-full px-3 py-2 text-sm text-stone-300 transition hover:bg-white/10 hover:text-white"
											@click="increaseQty(item.id)"
										>
											+
										</button>
									</div>

									<span class="rounded-full bg-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300">
										{{ item.prepTime }}
									</span>
								</div>
							</div>

							<div
								v-if="cartItems.length === 0"
								class="rounded-[24px] border border-dashed border-white/15 bg-white/5 px-4 py-8 text-center text-sm leading-7 text-stone-400"
							>
								ยังไม่มีสินค้าใน ticket นี้ ลองกดเพิ่มจาก product grid ด้านซ้าย
							</div>
						</div>

						<div class="mt-4 space-y-3 border-t border-white/10 pt-4">
							<div class="flex items-center justify-between text-sm text-stone-400">
								<span>Subtotal</span>
								<span>{{ formatMoney(subtotal) }}</span>
							</div>
							<div class="flex items-center justify-between text-sm text-stone-400">
								<span>VAT 7%</span>
								<span>{{ formatMoney(tax) }}</span>
							</div>
							<div class="flex items-center justify-between text-sm text-stone-400">
								<span>Service</span>
								<span>{{ formatMoney(serviceCharge) }}</span>
							</div>
							<div class="flex items-center justify-between text-xl font-semibold tracking-[-0.03em]">
								<span>Total</span>
								<span>{{ formatMoney(total) }}</span>
							</div>

							<div class="grid gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
								<button
									type="button"
									class="rounded-[20px] bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
								>
									Charge now
								</button>
								<button
									type="button"
									class="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
								>
									Hold ticket
								</button>
							</div>

							<p class="text-xs leading-6 text-stone-500">
								Starter UI only: payment, receipt, member lookup และ backend sync ยังไม่ถูกเชื่อมในรอบนี้
							</p>
						</div>
					</div>
				</aside>
			</div>
		</div>

		<div class="sticky bottom-0 z-20 border-t border-stone-900/10 bg-white/90 px-4 py-3 backdrop-blur xl:hidden">
			<div class="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
				<div>
					<p class="text-xs uppercase tracking-[0.22em] text-stone-400">
						Mobile summary
					</p>
					<p class="mt-1 text-sm font-medium text-stone-600">
						{{ itemCount }} items in {{ currentTicket }}
					</p>
				</div>
				<div class="text-right">
					<p class="text-lg font-semibold text-ink">
						{{ formatMoney(total) }}
					</p>
					<p class="text-xs text-stone-500">
						Scroll for full ticket panel
					</p>
				</div>
			</div>
		</div>
	</main>
</template>
