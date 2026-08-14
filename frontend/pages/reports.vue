<script setup lang="ts">
import type { EChartsCoreOption } from "echarts/core";
import { currencyDecimals, formatMoneyWithSymbol } from "~/utils/currency";
import { appNavItems } from "~/utils/app-nav";
import { formatAppDate, formatAppDateTime } from "~/utils/date-format";
import { csvFilename, downloadCsv } from "~/utils/csv";
import type { SummaryCard } from "~/utils/report-cards";

type Comparison={value:number|null;available:boolean};type Preset="today"|"yesterday"|"this_week"|"last_week"|"this_month"|"last_month"|"custom";
type Dashboard={currency:string;generated_at:string;period:{from:string;to:string;date_from:string;date_to:string;days:number};summary:{revenue:number;gross_sales:number;discount:number;discount_rate_percent:number;discounted_bill_count:number;vat_amount:number;shipping_revenue:number;shipping_cost:number;bill_count:number;average_bill:number;cancelled_refunded_count:number;cancelled_refunded_amount:number;gross_profit:number;gross_margin_percent:number;comparison:Record<string,Comparison>};profitability:{known_cost:number;known_gross_profit:number;gross_margin_percent:number;cost_coverage_percent:number;unknown_cost_revenue:number;unknown_cost_bills:number;unknown_cost_products:number};promotion_summary:{promotion_bill_count:number;applications:number;discount_amount:number;gift_quantity:number;gift_cost:number};promotion_performance:Array<{promotion_id:string;name:string;type:string;bill_count:number;applications:number;discount_amount:number;gift_quantity:number;gift_cost:number}>;sales_series:Array<{label:string;revenue:number;gross_sales:number;discount:number;vat_amount:number;bill_count:number;known_cost:number;gross_profit:number;unknown_cost_revenue:number}>;payment_mix:Array<{method:string;amount:number;bill_count:number;percent:number}>;uncosted_products:Array<{id:string;name:string;sku:string;inventory_mode:string;bill_count:number;revenue:number}>;product_type_performance:Array<{mode:string;quantity:number;revenue:number;known_cost:number;gift_cost:number;gross_profit:number;margin:number;unknown_cost_revenue:number;unknown_cost_products:number;cost_coverage_percent:number;revenue_share_percent:number}>;payment_currencies:Array<{currency:string;is_base:boolean;bill_count:number;amount_base:number;tendered_base:number;change_base:number;amount_foreign:number|null;exchange_rate:number;percent:number}>;cash_takings:{base_currency:string;drawer:Array<{currency:string;amount:number;amount_base:number;bill_count:number}>;drawer_total_base:number;bank_amount:number;bank_bill_count:number;card_amount:number;card_bill_count:number};payment_accounts:Array<{id:string;display_name:string;bank_name:string;account_number:string;currency:string;is_active:boolean;has_qr:boolean;amount:number;bill_count:number;average_bill:number;percent:number;last_paid_at:string|null}>;top_products:Array<{id:string;name:string;sku:string;quantity:number;revenue:number;percent:number;comparison:Comparison}>;product_mix:Array<{id:string;name:string;revenue:number;quantity:number;percent:number}>;category_performance:Array<{id:string;name:string;quantity:number;revenue:number;known_cost:number;gift_cost:number;gross_profit:number;margin:number;cost_coverage_percent:number}>;order_type_mix:Array<{type:string;revenue:number;bill_count:number}>;order_type_series:Array<{label:string;type:string;revenue:number;bill_count:number}>;heatmap:Array<{weekday:number;hour:number;revenue:number;bill_count:number}>;staff_ranking:Array<{id:string;name:string;bill_count:number;revenue:number;average_bill:number}>;low_stock:Array<{id:string;name:string;sku:string;available_base:number;threshold:number}>;operational_signals:{peak_period:string|null;peak_revenue:number;primary_payment_method:string|null;primary_payment_percent:number;restock_sku_count:number;out_of_stock_count:number;negative_stock_count:number;no_sales_count:number;inventory_value:number}};
type ProductRow={id:string;name:string;sku:string;category_name:string;quantity:number;average_price:number;revenue:number;known_cost:number;unknown_cost_revenue:number;gross_profit:number;margin:number;bill_count:number;comparison:Comparison};
type ProductReport={items:ProductRow[];categories:Array<{id:string;name:string}>;totals?:{product_count:number;quantity:number;revenue:number};pagination:{page:number;limit:number;total:number;pages:number}};
const {apiFetch}=useApiClient(),{currentStoreId}=useAuthSession(),{locale,t}=useI18n();
const appToast=useAppToast();
const appLocale=computed(()=>locale.value as "th"|"lo"|"en");
const activePreset=ref<Preset>("today"),activeView=ref<"sales"|"products"|"stock"|"purchasing"|"promotions"|"operations">("sales"),dateFrom=ref(""),dateTo=ref("");const dashboard=ref<Dashboard|null>(null),loading=ref(false),errorMessage=ref(""),version=ref(0);
const productMetric=ref<"revenue"|"quantity">("revenue"),productShareMetric=ref<"revenue"|"quantity">("revenue"),heatMetric=ref<"revenue"|"bill_count">("revenue"),productReport=ref<ProductReport|null>(null),productLoading=ref(false),productLoadVersion=ref(0),productSearch=ref(""),productCategory=ref(""),productSort=ref("revenue"),productOrder=ref<"asc"|"desc">("desc"),productPage=ref(1),selectedProduct=ref<ProductRow|null>(null),productTrend=ref<Array<{label:string;quantity:number;revenue:number}>>([]),trendLoading=ref(false);
type PurchasingReport={period:{from:string;to:string};summary:{po_count:number;goods_cost:number;shipping_cost:number;other_cost:number;total_spend:number;qty_received:number;average_landed_cost:number;extra_cost_percent:number;comparison:{total_spend:Comparison}};suppliers:Array<{supplier_name:string;po_count:number;total_spend:number}>;status_mix:Array<{status:string;po_count:number}>;inventory_value:{value:number;product_count:number};spend_series:Array<{label:string;total_spend:number;goods_cost:number;extra_cost:number}>;products:Array<{id:string;name:string;sku:string;qty_ordered:number;qty_received:number;qty_outstanding:number;goods_cost:number;freight_cost:number;total_cost:number;landed_unit_cost:number;po_count:number}>;payable:{po_count:number;amount:number};outstanding:{po_count:number;amount:number;qty:number}};
const purchasingReport=ref<PurchasingReport|null>(null),purchasingLoading=ref(false);let purchasingLoadVersion=0;
async function loadPurchasing(){if(!currentStoreId.value||activeView.value!=="purchasing")return;const token=++purchasingLoadVersion;purchasingLoading.value=true;try{const response=await apiFetch<{data:PurchasingReport}>(`/reports/purchasing?${query()}`);if(token===purchasingLoadVersion)purchasingReport.value=response.data;}finally{if(token===purchasingLoadVersion)purchasingLoading.value=false;}}
watch([activePreset,dateFrom,dateTo,currentStoreId,activeView],()=>void loadPurchasing());
// Stock is its own report: the value on the shelf right now, plus how much moved
// in and out during the period. Loaded only when the tab is open, like purchasing.
type StockReport={period:{from:string;to:string};currency:string;summary:{inventory_value:number;product_count:number;tracked_count:number;ready_count:number;low_count:number;out_count:number;negative_count:number;received_qty:number;sold_qty:number;removed_qty:number;manual_removed_cost:number};categories:Array<{id:string;name:string;product_count:number;quantity:number;value:number}>;top_products:Array<{id:string;name:string;sku:string;on_hand_base:number;unit_cost:number;value:number}>;low_stock:Array<{id:string;name:string;sku:string;available_base:number;threshold:number}>;movement_series:Array<{label:string;in_qty:number;sold_qty:number;out_qty:number}>};
const stockReport=ref<StockReport|null>(null),stockLoading=ref(false);let stockLoadVersion=0;
async function loadStock(){if(!currentStoreId.value||activeView.value!=="stock")return;const token=++stockLoadVersion;stockLoading.value=true;try{const response=await apiFetch<{data:StockReport}>(`/reports/stock?${query()}`);if(token===stockLoadVersion)stockReport.value=response.data;}finally{if(token===stockLoadVersion)stockLoading.value=false;}}
watch([activePreset,dateFrom,dateTo,currentStoreId,activeView],()=>void loadStock());
// Shipping and the other add-ons are one idea to the owner - what the goods cost
// on top of their price - so they share a card and break down in the hint.
const purchasingCards=computed<SummaryCard[]>(()=>{const p=purchasingReport.value;if(!p)return[];return[
	{key:"spend",label:t("reportPage.totalSpend"),value:money(p.summary.total_spend),hint:t("reportPage.totalSpendHint"),delta:delta(p.summary.comparison.total_spend)},
	{key:"goods",label:t("reportPage.goodsCost"),value:money(p.summary.goods_cost),hint:t("reportPage.goodsCostHint")},
	{key:"extra",label:t("reportPage.extraCost"),value:money(p.summary.shipping_cost+p.summary.other_cost),
		hint:t("reportPage.extraCostBreakdown",{shipping:money(p.summary.shipping_cost),other:money(p.summary.other_cost)})},
	{key:"po",label:t("reportPage.poCount"),value:num(p.summary.po_count),hint:t("reportPage.qtyReceivedShort",{qty:num(p.summary.qty_received)})},
	// No average landed cost here on purpose: across a period it divides the whole
	// spend by every unit received, mixing bottles with sacks into a figure that is
	// nothing's real cost. Per product it is meaningful, and that is the
	// landed_unit_cost column in the table below.
];});
const purchasingTrendOption=computed<EChartsCoreOption>(()=>({color:["#6366f1"],tooltip:commonTooltip,grid:{left:10,right:10,top:24,bottom:32,containLabel:true},xAxis:{type:"category",data:purchasingReport.value?.spend_series.map(x=>x.label)||[]},yAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[{name:t("reportPage.totalSpend"),type:"line",smooth:true,symbol:"circle",symbolSize:7,areaStyle:{color:"rgba(99,102,241,.14)"},data:purchasingReport.value?.spend_series.map(x=>x.total_spend)||[]}]}));
const purchasingCostMixOption=computed<EChartsCoreOption>(()=>({color:["#0ea5e9","#f59e0b"],tooltip:commonTooltip,legend:{bottom:0},grid:{left:10,right:10,top:24,bottom:48,containLabel:true},xAxis:{type:"category",data:purchasingReport.value?.spend_series.map(x=>x.label)||[]},yAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[[t("reportPage.goodsCost"),"goods_cost"],[t("reportPage.extraCost"),"extra_cost"]].map(([name,key])=>({name,type:"bar",stack:"total",barMaxWidth:26,data:purchasingReport.value?.spend_series.map(x=>x[key as keyof typeof x])||[]}))}));
const purchasingSupplierOption=computed<EChartsCoreOption>(()=>({tooltip:commonTooltip,legend:{bottom:0,type:"scroll"},series:[{type:"pie",radius:["45%","70%"],avoidLabelOverlap:true,itemStyle:{borderColor:"#fff",borderWidth:2},label:{show:false},data:(purchasingReport.value?.suppliers||[]).map(x=>({name:x.supplier_name||t("reportPage.unspecifiedSupplier"),value:x.total_spend}))}]}));
const dashboardInitialLoading=computed(()=>!dashboard.value&&!errorMessage.value),dashboardRefreshing=computed(()=>loading.value&&Boolean(dashboard.value));
const productsInitialLoading=computed(()=>productLoading.value&&!productReport.value),productsRefreshing=computed(()=>productLoading.value&&Boolean(productReport.value));
const intlLocale=computed(()=>locale.value==="lo"?"lo-LA":locale.value==="en"?"en-US":"th-TH"),money=(value:number)=>formatMoneyWithSymbol(value,dashboard.value?.currency||"LAK",{locale:intlLocale.value,maximumFractionDigits:0}),num=(value:number)=>new Intl.NumberFormat(intlLocale.value,{maximumFractionDigits:2}).format(value);
const presets=computed(()=>[{id:"today",label:t("reportPage.presets.today")},{id:"yesterday",label:t("reportPage.presets.yesterday")},{id:"this_week",label:t("reportPage.presets.thisWeek")},{id:"last_week",label:t("reportPage.presets.lastWeek")},{id:"this_month",label:t("reportPage.presets.thisMonth")},{id:"last_month",label:t("reportPage.presets.lastMonth")},{id:"custom",label:t("reportPage.presets.custom")}] as const);
const paymentLabel=(method:string|null)=>!method?"-":method==="cash"?t("reportPage.cash"):["qr","qr_transfer","transfer","bank_transfer"].includes(method)?t("reportPage.qrTransfer"):["card","credit_card"].includes(method)?t("reportPage.creditCard"):method;
const orderTypeLabel=(type:string)=>["restaurant","dine_in","dine-in","table"].includes(type)?t("reportPage.dineIn"):["pickup","takeaway","take_away"].includes(type)?t("reportPage.pickup"):type==="delivery"?t("reportPage.delivery"):["quick_sale","quick-sale","counter","pos"].includes(type)?t("reportPage.quickSale"):type==="other"?t("reportPage.other"):type;
const categoryLabel=(name:string)=>name==="Uncategorized"?t("reportPage.uncategorized"):name;
function query(){const params=new URLSearchParams({store_id:currentStoreId.value||"",preset:activePreset.value,timezone_offset:String(-new Date().getTimezoneOffset())});if(activePreset.value==="custom"){params.set("date_from",dateFrom.value);params.set("date_to",dateTo.value);}return params;}
const finiteNumber=(value:unknown)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;};
const unavailableComparison=():Comparison=>({value:null,available:false});
function normalizeDashboard(value:Partial<Dashboard>|null|undefined):Dashboard|null{
	if(!value||typeof value!=="object"||!value.period||!value.summary)return null;
	const raw=value as any,summary=raw.summary||{},profitability=raw.profitability||{},promotionSummary=raw.promotion_summary||{},signals=raw.operational_signals||{},comparisons=summary.comparison||{};
	const normalizeComparison=(item:any):Comparison=>item&&typeof item==="object"?{value:item.value===null?null:finiteNumber(item.value),available:Boolean(item.available)}:unavailableComparison();
	return{...raw,currency:String(raw.currency||"LAK"),generated_at:String(raw.generated_at||new Date().toISOString()),period:raw.period,
		summary:{revenue:finiteNumber(summary.revenue),gross_sales:finiteNumber(summary.gross_sales),discount:finiteNumber(summary.discount),discount_rate_percent:finiteNumber(summary.discount_rate_percent),discounted_bill_count:finiteNumber(summary.discounted_bill_count),vat_amount:finiteNumber(summary.vat_amount),shipping_revenue:finiteNumber(summary.shipping_revenue),shipping_cost:finiteNumber(summary.shipping_cost),bill_count:finiteNumber(summary.bill_count),average_bill:finiteNumber(summary.average_bill),cancelled_refunded_count:finiteNumber(summary.cancelled_refunded_count),cancelled_refunded_amount:finiteNumber(summary.cancelled_refunded_amount),gross_profit:finiteNumber(summary.gross_profit),gross_margin_percent:finiteNumber(summary.gross_margin_percent),comparison:{revenue:normalizeComparison(comparisons.revenue),bill_count:normalizeComparison(comparisons.bill_count),average_bill:normalizeComparison(comparisons.average_bill),cancelled_refunded_count:normalizeComparison(comparisons.cancelled_refunded_count)}},
		profitability:{known_cost:finiteNumber(profitability.known_cost),known_gross_profit:finiteNumber(profitability.known_gross_profit),gross_margin_percent:finiteNumber(profitability.gross_margin_percent),cost_coverage_percent:finiteNumber(profitability.cost_coverage_percent),unknown_cost_revenue:finiteNumber(profitability.unknown_cost_revenue),unknown_cost_bills:finiteNumber(profitability.unknown_cost_bills),unknown_cost_products:finiteNumber(profitability.unknown_cost_products)},
		promotion_summary:{promotion_bill_count:finiteNumber(promotionSummary.promotion_bill_count),applications:finiteNumber(promotionSummary.applications),discount_amount:finiteNumber(promotionSummary.discount_amount),gift_quantity:finiteNumber(promotionSummary.gift_quantity),gift_cost:finiteNumber(promotionSummary.gift_cost)},
		promotion_performance:Array.isArray(raw.promotion_performance)?raw.promotion_performance:[],
		sales_series:Array.isArray(raw.sales_series)?raw.sales_series.map((item:any)=>({...item,revenue:finiteNumber(item.revenue),gross_sales:finiteNumber(item.gross_sales),discount:finiteNumber(item.discount),vat_amount:finiteNumber(item.vat_amount),bill_count:finiteNumber(item.bill_count),known_cost:finiteNumber(item.known_cost),gross_profit:finiteNumber(item.gross_profit),unknown_cost_revenue:finiteNumber(item.unknown_cost_revenue)})):[],
		payment_mix:Array.isArray(raw.payment_mix)?raw.payment_mix:[],payment_currencies:Array.isArray(raw.payment_currencies)?raw.payment_currencies.map((item:any)=>({...item,tendered_base:finiteNumber(item.tendered_base),change_base:finiteNumber(item.change_base)})):[],cash_takings:{base_currency:String(raw.cash_takings?.base_currency||raw.currency||"LAK"),drawer:Array.isArray(raw.cash_takings?.drawer)?raw.cash_takings.drawer:[],drawer_total_base:finiteNumber(raw.cash_takings?.drawer_total_base),bank_amount:finiteNumber(raw.cash_takings?.bank_amount),bank_bill_count:finiteNumber(raw.cash_takings?.bank_bill_count),card_amount:finiteNumber(raw.cash_takings?.card_amount),card_bill_count:finiteNumber(raw.cash_takings?.card_bill_count)},uncosted_products:Array.isArray(raw.uncosted_products)?raw.uncosted_products:[],product_type_performance:Array.isArray(raw.product_type_performance)?raw.product_type_performance:[],payment_accounts:Array.isArray(raw.payment_accounts)?raw.payment_accounts:[],top_products:Array.isArray(raw.top_products)?raw.top_products:[],product_mix:Array.isArray(raw.product_mix)?raw.product_mix:[],category_performance:Array.isArray(raw.category_performance)?raw.category_performance:[],order_type_mix:Array.isArray(raw.order_type_mix)?raw.order_type_mix:[],order_type_series:Array.isArray(raw.order_type_series)?raw.order_type_series:[],heatmap:Array.isArray(raw.heatmap)?raw.heatmap:[],staff_ranking:Array.isArray(raw.staff_ranking)?raw.staff_ranking:[],low_stock:Array.isArray(raw.low_stock)?raw.low_stock:[],
		operational_signals:{peak_period:signals.peak_period?String(signals.peak_period):null,peak_revenue:finiteNumber(signals.peak_revenue),primary_payment_method:signals.primary_payment_method?String(signals.primary_payment_method):null,primary_payment_percent:finiteNumber(signals.primary_payment_percent),restock_sku_count:finiteNumber(signals.restock_sku_count),out_of_stock_count:finiteNumber(signals.out_of_stock_count),negative_stock_count:finiteNumber(signals.negative_stock_count),no_sales_count:finiteNumber(signals.no_sales_count),inventory_value:finiteNumber(signals.inventory_value)}} as Dashboard;
}
async function loadDashboard(){if(!currentStoreId.value)return;if(activePreset.value==="custom"&&(!dateFrom.value||!dateTo.value))return;const token=++version.value;loading.value=true;errorMessage.value="";try{const response=await apiFetch<{data:Dashboard}>(`/reports/dashboard?${query()}`);const normalized=normalizeDashboard(response.data);if(!normalized)throw new Error(t("reportPage.loadFailed"));if(token===version.value)dashboard.value=normalized;}catch(error:any){if(token===version.value)errorMessage.value=String(error?.data?.message||error?.message||t("reportPage.loadFailed"));}finally{if(token===version.value)loading.value=false;}}
async function loadProducts(){if(!currentStoreId.value||activeView.value!=="products")return;const token=++productLoadVersion.value;productLoading.value=true;try{const params=query();if(productSearch.value)params.set("search",productSearch.value);if(productCategory.value)params.set("category_id",productCategory.value);params.set("sort",productSort.value);params.set("order",productOrder.value);params.set("page",String(productPage.value));params.set("limit","20");const response=await apiFetch<{data:ProductReport}>(`/reports/products?${params}`);if(token===productLoadVersion.value)productReport.value=response.data;}finally{if(token===productLoadVersion.value)productLoading.value=false;}}
let searchTimer:ReturnType<typeof setTimeout>|undefined;watch([activePreset,dateFrom,dateTo,currentStoreId],()=>void loadDashboard(),{immediate:true});watch([activePreset,dateFrom,dateTo,currentStoreId,activeView,productCategory,productSort,productOrder,productPage],()=>void loadProducts());watch(productSearch,()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{productPage.value=1;void loadProducts();},300);});
async function openProduct(item:ProductRow){selectedProduct.value=item;trendLoading.value=true;try{productTrend.value=(await apiFetch<{data:{items:typeof productTrend.value}}>(`/reports/products/${encodeURIComponent(item.id)}/trend?${query()}`)).data.items;}finally{trendLoading.value=false;}}
// Exports carry raw numbers and ISO dates on purpose: values piped through
// money()/num() arrive in Excel as text and cannot be summed, and localised
// dates cannot be sorted. Currency lives in its own column instead.
const exportBusy=ref("");
function periodSuffix(){return[dashboard.value?.period.date_from,dashboard.value?.period.date_to] as [string|undefined,string|undefined];}
function runExport(key:string,base:string,headers:string[],rows:(string|number|null|undefined)[][]){
	if(!rows.length){appToast.error({title:t("reportPage.exportEmpty")});return;}
	const[from,to]=periodSuffix();
	const filename=csvFilename(base,from,to);
	try{downloadCsv(filename,headers,rows);appToast.success({title:t("reportPage.exported"),description:filename});}
	catch(error){appToast.error({title:t("reportPage.exportFailed"),description:error instanceof Error?error.message:""});}
	void key;
}
const currency=computed(()=>dashboard.value?.currency||"LAK");
// One owner-ready file: sections keep the single CSV readable in Excel while
// every amount remains numeric and tied to the active report period.
async function exportOwnerReport(){
	if(!dashboard.value||exportBusy.value)return;
	exportBusy.value="owner-report";
	try{
		const params=query();
		const [stockResponse,purchasingResponse]=await Promise.all([
			apiFetch<{data:StockReport}>(`/reports/stock?${params}`),
			apiFetch<{data:PurchasingReport}>(`/reports/purchasing?${params}`),
		]);
		const d=dashboard.value,stock=stockResponse.data,purchasing=purchasingResponse.data;
		const rows:(string|number|null|undefined)[][]=[
			["period","from",d.period.from,"","",currency.value],["period","to",d.period.to,"","",currency.value],
			["sales","net_sales",d.summary.revenue,"","",currency.value],["sales","gross_sales",d.summary.gross_sales,"","",currency.value],["sales","discount",d.summary.discount,"","",currency.value],["sales","vat",d.summary.vat_amount,"","",currency.value],["sales","bills",d.summary.bill_count,"","",currency.value],["sales","average_bill",d.summary.average_bill,"","",currency.value],
			...d.payment_mix.map(item=>["payment",item.method,item.amount,item.bill_count,item.percent,currency.value]),
			...d.top_products.map(item=>["top_product",item.name,item.revenue,item.quantity,item.percent,currency.value]),
			...d.promotion_performance.map(item=>["promotion",item.name,item.discount_amount,item.applications,item.bill_count,currency.value]),
			["stock","inventory_value",stock.summary.inventory_value,"","",stock.currency],["stock","low_stock",stock.summary.low_count,"","",stock.currency],["stock","out_of_stock",stock.summary.out_count,"","",stock.currency],["stock","negative_stock",stock.summary.negative_count,"","",stock.currency],
			...stock.low_stock.map(item=>["low_stock_product",item.name,item.available_base,item.threshold,item.sku,stock.currency]),
			["purchasing","total_spend",purchasing.summary.total_spend,"","",currency.value],["purchasing","goods_cost",purchasing.summary.goods_cost,"","",currency.value],["purchasing","shipping_cost",purchasing.summary.shipping_cost,"","",currency.value],["purchasing","other_cost",purchasing.summary.other_cost,"","",currency.value],["purchasing","purchase_orders_received",purchasing.summary.po_count,purchasing.summary.qty_received,"",currency.value],
		];
		runExport("owner-report","store-report",["section","metric","amount_or_value","count","detail_or_percent","currency"],rows);
	}catch(error){appToast.error({title:t("reportPage.exportFailed"),description:error instanceof Error?error.message:""});}
	finally{exportBusy.value="";}
}
function exportSalesSeries(){const d=dashboard.value;if(!d)return;runExport("sales","sales-series",
	[t("reportPage.period"),t("reportPage.grossSales"),t("reportPage.discount"),"VAT",t("reportPage.netSales"),t("reportPage.cost"),t("reportPage.profit"),t("reportPage.unknownCost"),t("reportPage.billCount"),t("reportPage.currency")],
	d.sales_series.map(x=>[x.label,x.gross_sales,x.discount,x.vat_amount,x.revenue,x.known_cost,x.gross_profit,x.unknown_cost_revenue,x.bill_count,currency.value]));}
function exportProductTypes(){const d=dashboard.value;if(!d)return;runExport("product-types","product-types",
	[t("reportPage.productType"),t("reportPage.quantitySold"),t("reportPage.revenue"),t("reportPage.totalCost"),t("reportPage.giftCostIncluded"),t("reportPage.profit"),t("reportPage.margin")+" (%)",t("reportPage.costCoverage")+" (%)",t("reportPage.unknownCost"),t("reportPage.currency")],
	d.product_type_performance.map(x=>[productTypeLabel(x.mode),x.quantity,x.revenue,x.known_cost,x.gift_cost,x.gross_profit,x.margin.toFixed(1),x.cost_coverage_percent.toFixed(1),x.unknown_cost_revenue,currency.value]));}
function exportPaymentAccounts(){const d=dashboard.value;if(!d)return;runExport("payment-accounts","payment-accounts",
	[t("reportPage.account"),t("reportPage.bankName"),t("reportPage.accountNumber"),t("reportPage.bills"),t("reportPage.amount"),t("reportPage.share")+" (%)",t("reportPage.averageBill"),t("reportPage.lastReceived"),t("reportPage.currency")],
	d.payment_accounts.map(x=>[accountLabel(x),x.bank_name,x.account_number,x.bill_count,x.amount,x.percent.toFixed(1),x.average_bill,x.last_paid_at||"",currency.value]));}
// Exported separately from the accounts: an owner reconciling a drawer needs the
// figure in the currency the notes are in, which a kip-only sheet cannot give.
function exportTakings(){const d=dashboard.value;if(!d)return;runExport("takings","takings",
	[t("reportPage.currency"),t("reportPage.bills"),t("reportPage.takingsTendered"),`${t("reportPage.takingsTendered")} (${d.currency})`,t("reportPage.takingsChange"),t("reportPage.takingsSalesValue"),t("reportPage.takingsAverageRate",{rate:""}).trim(),t("reportPage.share")+" (%)"],
	d.payment_currencies.map(x=>[x.currency,x.bill_count,x.amount_foreign===null?x.amount_base:x.amount_foreign,x.tendered_base,x.change_base,x.amount_base,x.is_base?"":Math.round(x.exchange_rate),x.percent.toFixed(1)]));}
function exportCategories(){const d=dashboard.value;if(!d)return;runExport("categories","category-performance",
	[t("reportPage.category"),t("reportPage.quantitySold"),t("reportPage.revenue"),t("reportPage.totalCost"),t("reportPage.giftCostIncluded"),t("reportPage.profit"),t("reportPage.margin")+" (%)",t("reportPage.costCoverage")+" (%)",t("reportPage.currency")],
	d.category_performance.map(x=>[categoryLabel(x.name),x.quantity,x.revenue,x.known_cost,x.gift_cost,x.gross_profit,x.margin,x.cost_coverage_percent,currency.value]));}
function exportLowStock(){const rows=stockReport.value?.low_stock||dashboard.value?.low_stock||[];runExport("low-stock","low-stock",
	[t("reportPage.product"),"SKU",t("reportPage.available"),t("reportPage.threshold")],
	rows.map(x=>[x.name,x.sku,x.available_base,x.threshold]));}
function exportStockValue(){const report=stockReport.value;if(!report)return;runExport("stock-value","stock-value",
	[t("reportPage.product"),"SKU",t("reportPage.onHand"),t("reportPage.unitCost"),t("reportPage.inventoryValue"),t("reportPage.currency")],
	report.top_products.map(x=>[x.name,x.sku,x.on_hand_base,x.unit_cost,x.value,currency.value]));}
function exportStockCategories(){const report=stockReport.value;if(!report)return;runExport("stock-categories","stock-by-category",
	[t("reportPage.category"),t("reportPage.products"),t("reportPage.onHand"),t("reportPage.inventoryValue"),t("reportPage.currency")],
	report.categories.map(x=>[categoryLabel(x.name),x.product_count,x.quantity,x.value,currency.value]));}
function exportPromotions(){const d=dashboard.value;if(!d)return;runExport("promotions","promotion-performance",
	[t("reportPage.promotion"),t("reportPage.bills"),t("reportPage.applications"),t("reportPage.giftQuantity"),t("reportPage.giftCost"),t("reportPage.promotionDiscount"),t("reportPage.currency")],
	d.promotion_performance.map(x=>[x.name,x.bill_count,x.applications,x.gift_quantity,x.gift_cost,x.discount_amount,currency.value]));}
function exportStaff(){const d=dashboard.value;if(!d)return;runExport("staff","staff-ranking",
	[t("reportPage.staff"),t("reportPage.bills"),t("reportPage.revenue"),t("reportPage.averageBill"),t("reportPage.currency")],
	d.staff_ranking.map(x=>[x.name,x.bill_count,x.revenue,x.average_bill,currency.value]));}
function exportPurchasedProducts(){const p=purchasingReport.value;if(!p)return;runExport("purchased","purchased-products",
	[t("reportPage.product"),"SKU",t("reportPage.qtyOrdered"),t("reportPage.qtyReceived"),t("reportPage.qtyOutstanding"),t("reportPage.goodsCost"),t("reportPage.shippingCostLabel"),t("reportPage.landedUnitCost"),t("reportPage.totalSpend"),t("reportPage.poCount"),t("reportPage.currency")],
	p.products.map(x=>[x.name,x.sku,x.qty_ordered,x.qty_received,x.qty_outstanding,x.goods_cost,x.freight_cost,x.landed_unit_cost,x.total_cost,x.po_count,currency.value]));}
function exportSuppliers(){const p=purchasingReport.value;if(!p)return;runExport("suppliers","supplier-spend",
	[t("reportPage.supplier"),t("reportPage.poCount"),t("reportPage.totalSpend"),t("reportPage.currency")],
	p.suppliers.map(x=>[x.supplier_name||t("reportPage.unspecifiedSupplier"),x.po_count,x.total_spend,currency.value]));}
// The product report is server-paginated, so every page is pulled before export
// rather than shipping only the 20 rows on screen. Current filters are kept.
async function exportAllProducts(){
	if(exportBusy.value)return;
	exportBusy.value="products";
	try{
		const build=(page:number)=>{const params=query();if(productSearch.value)params.set("search",productSearch.value);if(productCategory.value)params.set("category_id",productCategory.value);params.set("sort",productSort.value);params.set("order",productOrder.value);params.set("page",String(page));params.set("limit","100");return params;};
		const first=await apiFetch<{data:ProductReport}>(`/reports/products?${build(1)}`);
		const pages=first.data.pagination.pages||1;
		const rest=pages>1?await Promise.all(Array.from({length:pages-1},(_,i)=>apiFetch<{data:ProductReport}>(`/reports/products?${build(i+2)}`))):[];
		const items=[...first.data.items,...rest.flatMap(r=>r.data.items)];
		runExport("products","product-report",
			[t("reportPage.product"),"SKU",t("reportPage.category"),t("reportPage.quantity"),t("reportPage.averagePrice"),t("reportPage.revenue"),t("reportPage.unitCost"),t("reportPage.cost"),t("reportPage.unknownCost"),t("reportPage.profit"),t("reportPage.margin")+" (%)",t("reportPage.bills"),t("reportPage.currency")],
			items.map(x=>[x.name,x.sku,categoryLabel(x.category_name),x.quantity,x.average_price,x.revenue,x.quantity>0?x.known_cost/x.quantity:"",x.known_cost,x.unknown_cost_revenue,x.gross_profit,x.margin,x.bill_count,currency.value]));
	}catch(error){appToast.error({title:t("reportPage.exportFailed"),description:error instanceof Error?error.message:""});}
	finally{exportBusy.value="";}
}
const shortDate=(value:string)=>formatAppDate(new Date(value),appLocale.value,{dateStyle:"medium"});
const formatPeriodDate=(value:string)=>formatAppDate(new Date(`${value}T00:00:00+07:00`),appLocale.value,{dateStyle:appLocale.value==="lo"?"long":"medium"});
const periodText=computed(()=>{if(!dashboard.value)return "-";const from=formatPeriodDate(dashboard.value.period.date_from);const to=formatPeriodDate(dashboard.value.period.date_to);return dashboard.value.period.date_from===dashboard.value.period.date_to?from:`${from} – ${to}`;});
const businessPeriodText=computed(()=>{if(!dashboard.value)return"";const from=new Date(dashboard.value.period.from),to=new Date(new Date(dashboard.value.period.to).getTime()-1);return t("businessPeriod.range",{from:formatAppDateTime(from,appLocale.value),to:formatAppDateTime(to,appLocale.value)});});
const costDataComplete=computed(()=>!dashboard.value||dashboard.value.profitability.unknown_cost_revenue<=0);
// Whatever tab is open, the owner came for these three. They stay above the tabs
// as a single line so the rest of the page can belong entirely to the tab.
const headlineStats=computed(()=>{
	const d=dashboard.value;
	if(!d)return [];
	return [
		{key:"sales",label:t("reportPage.netSales"),value:money(d.summary.revenue),delta:delta(d.summary.comparison.revenue)},
		{key:"profit",label:costDataComplete.value?t("reportPage.grossProfit"):t("reportPage.profitAtLeast"),value:money(d.summary.gross_profit),delta:null},
		{key:"bills",label:t("reportPage.billCount"),value:num(d.summary.bill_count),delta:delta(d.summary.comparison.bill_count)},
	];
});
// The headline is what the owner opens the report for. While some sales carry no
// cost the profit shown is only its lower bound, so it says so and gives the gap
// its own tile; once every sale is costed the third tile becomes the margin and
// the qualifiers disappear on their own.
// Every figure keeps its slot whether or not it has a value this period, so the
// card in a given position is always the same card and the owner can find it
// without reading the labels. Zeros are shown rather than hidden for that reason.
const salesCards=computed<SummaryCard[]>(()=>{
	const d=dashboard.value;
	if(!d)return [];
	const uncosted=d.profitability.unknown_cost_revenue;
	return [
		{key:"sales",label:t("reportPage.netSales"),value:money(d.summary.revenue),delta:delta(d.summary.comparison.revenue)},
		{key:"cost",label:t("reportPage.costOfSales"),value:money(d.profitability.known_cost)},
		// The label still tells the truth about what the number covers, but the
		// card itself never moves.
		{key:"profit",label:costDataComplete.value?t("reportPage.grossProfit"):t("reportPage.profitAtLeast"),
			value:money(d.summary.gross_profit),
			note:costDataComplete.value?"":t("reportPage.profitCeiling",{amount:money(d.summary.revenue-d.profitability.known_cost)})},
		{key:"margin",label:costDataComplete.value?t("reportPage.margin"):t("reportPage.marginOfCosted"),
			value:`${d.summary.gross_margin_percent.toFixed(1)}%`},
		{key:"uncosted",label:t("reportPage.uncostedSales"),value:money(uncosted),
			tone:uncosted>0?"amber":"",
			note:uncosted>0?t("reportPage.shareOfSales",{percent:(d.summary.revenue?uncosted/d.summary.revenue*100:0).toFixed(0)}):"",
			actionLabel:uncosted>0?t("reportPage.setCost"):"",
			actionDisabled:!uncostedProducts.value.length},
		{key:"bills",label:t("reportPage.billCount"),value:num(d.summary.bill_count),delta:delta(d.summary.comparison.bill_count)},
	];
});
// Figures that explain the headline rather than compete with it, so they sit
// under the charts instead of above them.
const salesDetailCards=computed<SummaryCard[]>(()=>{
	const d=dashboard.value;
	if(!d)return [];
	const cancelled=d.summary.cancelled_refunded_count;
	return [
		{key:"average",label:t("reportPage.averageBill"),value:money(d.summary.average_bill),delta:delta(d.summary.comparison.average_bill)},
		{key:"gross",label:t("reportPage.grossSales"),value:money(d.summary.gross_sales)},
		{key:"discount",label:t("reportPage.discount"),value:money(d.summary.discount)},
		{key:"vat",label:"VAT",value:money(d.summary.vat_amount)},
		// A cancelled bill is an exception worth noticing, so it is tinted when it
		// happens - without leaving its slot when it does not.
		{key:"cancel",label:t("reportPage.cancelRefund"),value:num(cancelled),tone:cancelled>0?"amber":""},
		{key:"giftCost",label:t("reportPage.giftCost"),value:money(d.promotion_summary.gift_cost),hint:t("reportPage.giftQuantityShort",{count:num(d.promotion_summary.gift_quantity)})},
	];
});
// Counted over every row the current filters match, not just the page on screen.
const productCards=computed<SummaryCard[]>(()=>{
	const report=productReport.value;
	const d=dashboard.value;
	if(!report||!d)return [];
	const best=d.top_products[0];
	// The named list stops at ten; this is every product missing a cost.
	const uncostedCount=d.profitability.unknown_cost_products;
	return [
		{key:"skus",label:t("reportPage.skusSold"),value:num(report.totals?.product_count??report.pagination.total),hint:t("reportPage.skusSoldHint")},
		{key:"quantity",label:t("reportPage.quantitySold"),value:num(report.totals?.quantity??0)},
		{key:"revenue",label:t("reportPage.revenue"),value:money(report.totals?.revenue??0),hint:productSearch.value||productCategory.value?t("reportPage.filteredTotal"):""},
		{key:"best",label:t("reportPage.bestSeller"),value:best?best.name:"—",hint:best?money(best.revenue):""},
		{key:"uncosted",label:t("reportPage.uncostedProductCount"),value:num(uncostedCount),
			tone:uncostedCount>0?"amber":"",
			note:uncostedCount>0?t("reportPage.uncostedProductHint"):"",
			actionLabel:uncostedCount>0?t("reportPage.setCost"):""},
		{key:"noSales",label:t("reportPage.noSales"),value:num(d.operational_signals.no_sales_count),hint:t("reportPage.noSalesHint")},
	];
});
// Stock lives in its own tab now, so this one carries only how the shop ran:
// when it sold, how customers paid, and who was behind the counter.
const operationCards=computed<SummaryCard[]>(()=>{
	const d=dashboard.value;
	if(!d)return [];
	const signals=d.operational_signals;
	const topStaff=d.staff_ranking[0];
	return [
		{key:"peak",label:t("reportPage.peakPeriod"),value:signals.peak_period||"—",hint:signals.peak_period?money(signals.peak_revenue):""},
		{key:"payment",label:t("reportPage.primaryPayment"),value:paymentLabel(signals.primary_payment_method),
			hint:signals.primary_payment_method?t("reportPage.shareOfSales",{percent:signals.primary_payment_percent.toFixed(0)}):""},
		{key:"topStaff",label:t("reportPage.topStaff"),value:topStaff?topStaff.name:"—",hint:topStaff?money(topStaff.revenue):""},
		{key:"staffCount",label:t("reportPage.sellingStaff"),value:num(d.staff_ranking.length),hint:t("reportPage.sellingStaffHint")},
	];
});
// Counts are as of now; the movement figures are for the chosen period. The two
// are never added together, and the badge on the card says which is which.
const stockCards=computed<SummaryCard[]>(()=>{
	const report=stockReport.value;
	if(!report)return [];
	const summary=report.summary;
	const snapshot={badge:t("reportPage.asOfNow"),badgeTitle:t("reportPage.asOfNowHint")};
	return [
		{key:"value",label:t("reportPage.inventoryValue"),value:money(summary.inventory_value),
			hint:t("reportPage.inventoryValueBreakdown",{count:num(summary.product_count)}),...snapshot},
		{key:"ready",label:t("reportPage.readyForSale"),value:num(summary.ready_count),hint:t("reportPage.trackedProducts",{count:num(summary.tracked_count)}),...snapshot},
		{key:"low",label:t("reportPage.lowStock"),value:num(summary.low_count),tone:summary.low_count>0?"amber":"",...snapshot},
		{key:"out",label:t("reportPage.outOfStock"),value:num(summary.out_count),tone:summary.out_count>0?"amber":"",...snapshot},
		{key:"negative",label:t("reportPage.negativeStock"),value:num(summary.negative_count),tone:summary.negative_count>0?"amber":"",...snapshot},
		{key:"movement",label:t("reportPage.stockMovement"),value:`+${num(summary.received_qty)} / −${num(summary.sold_qty+summary.removed_qty)}`,
			hint:t("reportPage.stockMovementHint",{sold:num(summary.sold_qty),removed:num(summary.removed_qty)})},
		{key:"manualRemovedCost",label:t("reportPage.stockRemoved"),value:money(summary.manual_removed_cost),hint:`${num(summary.removed_qty)} ${t("reportPage.items")}`},
	];
});
const calcOpen=ref(false);
const salesChain=computed(()=>{
	const d=dashboard.value;
	if(!d)return null;
	return{gross:d.summary.gross_sales,discount:d.summary.discount,discountBills:d.summary.discounted_bill_count,
		shipping:d.summary.shipping_revenue,net:d.summary.revenue,vat:d.summary.vat_amount,
		cancelledCount:d.summary.cancelled_refunded_count,cancelledAmount:d.summary.cancelled_refunded_amount};
});
const promotionCards=computed<SummaryCard[]>(()=>dashboard.value?[{key:"bills",label:t("reportPage.promotionBills"),value:num(dashboard.value.promotion_summary.promotion_bill_count),hint:t("reportPage.promotionApplications",{count:num(dashboard.value.promotion_summary.applications)})},{key:"giftQty",label:t("reportPage.giftQuantity"),value:num(dashboard.value.promotion_summary.gift_quantity),hint:t("reportPage.freeItemsHint")},{key:"giftCost",label:t("reportPage.giftCost"),value:money(dashboard.value.promotion_summary.gift_cost),hint:t("reportPage.giftCostHint")},{key:"discount",label:t("reportPage.promotionDiscount"),value:money(dashboard.value.promotion_summary.discount_amount),hint:t("reportPage.cashDiscountHint")}]:[]);
const comparisonText=(item?:Comparison)=>item?.available&&item.value!==null?`${item.value>=0?"+":""}${item.value.toFixed(1)}%`:"—";
// A comparison only earns a badge when there is a previous period to compare
// with; an em dash next to every figure reads as data missing, not as no data.
const delta=(item?:Comparison)=>item?.available&&item.value!==null?{text:comparisonText(item),positive:item.value>=0}:null;
const commonTooltip={trigger:"axis",backgroundColor:"#fff",borderColor:"#e7e5e4",textStyle:{color:"#292524"}};
const salesOption=computed<EChartsCoreOption>(()=>({color:["#10b981","#3b82f6"],tooltip:commonTooltip,legend:{bottom:0,data:[t("reportPage.sales"),t("reportPage.billCount")]},grid:{left:12,right:18,top:24,bottom:54,containLabel:true},xAxis:{type:"category",data:dashboard.value?.sales_series.map(x=>x.label)||[],axisLine:{lineStyle:{color:"#d6d3d1"}}},yAxis:[{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},{type:"value",splitLine:{show:false}}],dataZoom:(dashboard.value?.sales_series.length||0)>14?[{type:"inside"},{type:"slider",height:14,bottom:28}]:[],series:[{name:t("reportPage.sales"),type:"line",smooth:true,symbol:"circle",symbolSize:7,areaStyle:{color:"rgba(16,185,129,.14)"},data:dashboard.value?.sales_series.map(x=>x.revenue)||[]},{name:t("reportPage.billCount"),type:"bar",yAxisIndex:1,barMaxWidth:18,itemStyle:{color:"rgba(59,130,246,.35)",borderRadius:[4,4,0,0]},data:dashboard.value?.sales_series.map(x=>x.bill_count)||[]}]}));
const profitOption=computed<EChartsCoreOption>(()=>({color:["#f59e0b","#10b981","#a8a29e"],tooltip:commonTooltip,legend:{bottom:0},grid:{left:10,right:10,top:24,bottom:48,containLabel:true},xAxis:{type:"category",data:dashboard.value?.sales_series.map(x=>x.label)||[]},yAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[[t("reportPage.cost"),"known_cost"],[t("reportPage.profit"),"gross_profit"],[t("reportPage.unknownCost"),"unknown_cost_revenue"]].map(([name,key])=>({name,type:"bar",stack:"total",barMaxWidth:26,data:dashboard.value?.sales_series.map(x=>x[key as keyof typeof x])||[]}))}));
const donutOption=computed<EChartsCoreOption>(()=>({color:["#10b981","#3b82f6","#8b5cf6","#f59e0b","#a8a29e"],tooltip:{trigger:"item",formatter:(p:any)=>`${p.name}<br/>${money(p.value)} · ${p.percent}%`},legend:{bottom:0,type:"scroll"},series:[{type:"pie",radius:["48%","72%"],center:["50%","43%"],padAngle:2,itemStyle:{borderRadius:5,borderColor:"#fff",borderWidth:2},label:{show:false},data:dashboard.value?.payment_mix.map(x=>({name:paymentLabel(x.method),value:x.amount}))||[]}]}));
const uncostedProducts=computed(()=>dashboard.value?.uncosted_products||[]);
// The summary shows total revenue beside a profit computed only from the costed
// part, so subtracting the two on screen never works out. This is that missing
// middle step, spelled out.
const profitBridge=computed(()=>{
	const d=dashboard.value;
	if(!d)return null;
	const revenue=d.summary.revenue,uncosted=d.profitability.unknown_cost_revenue;
	const costed=Math.max(0,revenue-uncosted);
	return{revenue,uncosted,costed,cost:d.profitability.known_cost,profit:d.profitability.known_gross_profit,
		coverage:revenue?costed/revenue*100:0,margin:d.profitability.gross_margin_percent};
});
// edit_product_id opens the product EDIT form, which is not where the cost is
// set - that lives in its own dialog behind the detail panel. This parameter
// opens the cost dialog itself, so the report's button lands on the one field
// the owner came to fill in.
function openProductCost(productId:string){void navigateTo(`/products?adjust_cost_product_id=${encodeURIComponent(productId)}`);}
// The uncosted card sends the owner to the first product missing a cost; the rest
// are listed in the "how is this calculated" panel.
function openFirstUncostedProduct(){const first=uncostedProducts.value[0];if(first)openProductCost(first.id);}
const productTypeRows=computed(()=>(dashboard.value?.product_type_performance||[]).filter(row=>row.revenue||row.quantity));
const productTypeLabel=(mode:string)=>mode==="untracked"?t("reportPage.typeUntracked"):t("reportPage.typeTracked");
const paymentAccountRows=computed(()=>dashboard.value?.payment_accounts||[]);
// What the owner has to go and physically collect. Amounts are shown in the
// currency the notes are actually in, because a converted kip figure cannot be
// counted against a drawer holding baht.
const cashTakings=computed(()=>dashboard.value?.cash_takings||null);
const currencyRows=computed(()=>dashboard.value?.payment_currencies||[]);
// Worth showing only once a second currency has actually been taken; a shop on
// one currency would just see its own total repeated.
const showTakings=computed(()=>currencyRows.value.some(item=>!item.is_base));
const foreignMoney=(value:number,code:string)=>formatMoneyWithSymbol(value,code,{locale:intlLocale.value,maximumFractionDigits:currencyDecimals(code),minimumFractionDigits:currencyDecimals(code)});
// The collected figure has to land back on the period revenue. When it does not,
// a bill is missing its rate and the owner needs to see that, not a silent gap.
const takingsCheck=computed(()=>{
	const takings=cashTakings.value;
	if(!takings||!dashboard.value)return null;
	const collected=takings.drawer_total_base+takings.bank_amount+takings.card_amount;
	return{collected,revenue:dashboard.value.summary.revenue,balanced:Math.abs(collected-dashboard.value.summary.revenue)<1};
});
const accountLabel=(row:{id:string;display_name:string;bank_name:string})=>row.id==="unassigned"?t("reportPage.unassignedAccount"):[row.display_name,row.bank_name].filter(Boolean).join(" · ")||row.display_name||row.id;
const accountMaskedNumber=(value:string)=>value&&value.length>4?`••••${value.slice(-4)}`:value;
const accountOption=computed<EChartsCoreOption>(()=>{const rows=[...paymentAccountRows.value].slice(0,8).reverse();return{color:["#3b82f6"],tooltip:{trigger:"axis",axisPointer:{type:"shadow"},valueFormatter:(value:any)=>money(Number(value))},grid:{left:8,right:24,top:8,bottom:20,containLabel:true},xAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},yAxis:{type:"category",data:rows.map(accountLabel),axisLabel:{width:130,overflow:"truncate"}},series:[{type:"bar",barMaxWidth:18,itemStyle:{borderRadius:[0,5,5,0]},data:rows.map(x=>x.amount)}]};});
const productOption=computed<EChartsCoreOption>(()=>{const rows=[...(dashboard.value?.top_products||[])].slice(0,8).reverse();return{color:["#10b981"],tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},grid:{left:8,right:24,top:8,bottom:20,containLabel:true},xAxis:{type:"value",splitLine:{lineStyle:{color:"#f5f5f4"}}},yAxis:{type:"category",data:rows.map(x=>x.name),axisLabel:{width:110,overflow:"truncate"}},series:[{type:"bar",barMaxWidth:18,itemStyle:{borderRadius:[0,5,5,0]},data:rows.map(x=>productMetric.value==="revenue"?x.revenue:x.quantity)}]};});
const productShareOption=computed<EChartsCoreOption>(()=>({color:["#10b981","#3b82f6","#8b5cf6","#f59e0b","#ec4899","#06b6d4","#84cc16","#f97316","#a8a29e"],tooltip:{trigger:"item",formatter:(p:any)=>`${p.name}<br/>${productShareMetric.value==="revenue"?money(p.value):t("reportPage.itemValue",{value:num(p.value)})} · ${p.percent}%`},legend:{bottom:0,type:"scroll",formatter:(name:string)=>name==="Other products"?t("reportPage.otherProducts"):name},series:[{type:"pie",radius:["48%","72%"],center:["50%","43%"],padAngle:2,itemStyle:{borderRadius:5,borderColor:"#fff",borderWidth:2},label:{show:false},data:dashboard.value?.product_mix.map(x=>({name:x.name==="Other products"?t("reportPage.otherProducts"):x.name,value:productShareMetric.value==="revenue"?x.revenue:x.quantity}))||[]}]}));
const categoryOption=computed<EChartsCoreOption>(()=>{const rows=[...(dashboard.value?.category_performance||[])].slice(0,8).reverse();return{color:["#3b82f6","#10b981"],tooltip:{trigger:"axis",axisPointer:{type:"shadow"},valueFormatter:(value:any)=>money(Number(value))},legend:{bottom:0},grid:{left:8,right:18,top:16,bottom:44,containLabel:true},xAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},yAxis:{type:"category",data:rows.map(x=>categoryLabel(x.name)),axisLabel:{width:120,overflow:"truncate"}},series:[{name:t("reportPage.revenue"),type:"bar",barMaxWidth:16,data:rows.map(x=>x.revenue)},{name:t("reportPage.calculatedProfit"),type:"bar",barMaxWidth:16,data:rows.map(x=>x.gross_profit)}]};});
const discountOption=computed<EChartsCoreOption>(()=>({color:["#10b981","#f59e0b"],tooltip:{trigger:"axis",valueFormatter:(value:any)=>money(Number(value))},legend:{bottom:0},grid:{left:10,right:16,top:20,bottom:48,containLabel:true},xAxis:{type:"category",data:dashboard.value?.sales_series.map(x=>x.label)||[]},yAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[{name:t("reportPage.netSales"),type:"line",smooth:true,data:dashboard.value?.sales_series.map(x=>x.revenue)||[]},{name:t("reportPage.discount"),type:"bar",barMaxWidth:18,data:dashboard.value?.sales_series.map(x=>x.discount)||[]}]}));
const promotionValueOption=computed<EChartsCoreOption>(()=>{const rows=dashboard.value?.promotion_performance||[];return{color:["#f59e0b","#8b5cf6"],tooltip:{trigger:"axis",axisPointer:{type:"shadow"},valueFormatter:(value:any)=>money(Number(value))},legend:{bottom:0},grid:{left:10,right:16,top:24,bottom:52,containLabel:true},xAxis:{type:"category",data:rows.map(x=>x.name),axisLabel:{width:110,overflow:"truncate"}},yAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[{name:t("reportPage.promotionDiscount"),type:"bar",barMaxWidth:24,data:rows.map(x=>x.discount_amount)},{name:t("reportPage.giftCost"),type:"bar",barMaxWidth:24,data:rows.map(x=>x.gift_cost)}]};});
const promotionUsageOption=computed<EChartsCoreOption>(()=>{const rows=dashboard.value?.promotion_performance||[];return{color:["#10b981","#3b82f6"],tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},legend:{bottom:0},grid:{left:10,right:16,top:24,bottom:52,containLabel:true},xAxis:{type:"category",data:rows.map(x=>x.name),axisLabel:{width:110,overflow:"truncate"}},yAxis:{type:"value",minInterval:1,splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[{name:t("reportPage.bills"),type:"bar",barMaxWidth:24,data:rows.map(x=>x.bill_count)},{name:t("reportPage.applications"),type:"bar",barMaxWidth:24,data:rows.map(x=>x.applications)}]};});
const orderOption=computed<EChartsCoreOption>(()=>{const labels=dashboard.value?.sales_series.map(x=>x.label)||[],types=[...new Set(dashboard.value?.order_type_series.map(x=>x.type)||[])];return{color:["#10b981","#3b82f6","#8b5cf6","#f59e0b"],tooltip:{trigger:"axis",axisPointer:{type:"shadow"}},legend:{bottom:0},grid:{left:8,right:16,top:28,bottom:48,containLabel:true},xAxis:{type:"category",data:labels},yAxis:{type:"value",splitLine:{lineStyle:{color:"#f5f5f4"}}},series:types.map(type=>({name:orderTypeLabel(type),type:"bar",stack:"orders",barMaxWidth:26,data:labels.map(label=>dashboard.value?.order_type_series.find(x=>x.label===label&&x.type===type)?.revenue||0)}))};});
const heatOption=computed<EChartsCoreOption>(()=>{const values=dashboard.value?.heatmap.map(x=>[x.hour,x.weekday,heatMetric.value==="revenue"?x.revenue:x.bill_count])||[],max=Math.max(1,...values.map(x=>Number(x[2]))),weekdays=Array.from({length:7},(_,index)=>t(`reportPage.weekdays.${index}`));return{tooltip:{formatter:(p:any)=>`${weekdays[p.value[1]]} ${String(p.value[0]).padStart(2,"0")}:00<br/>${heatMetric.value==="revenue"?money(p.value[2]):t("reportPage.billValue",{value:p.value[2]})}`},grid:{left:12,right:20,top:10,bottom:42,containLabel:true},xAxis:{type:"category",data:Array.from({length:24},(_,i)=>String(i).padStart(2,"0")),splitArea:{show:true}},yAxis:{type:"category",data:weekdays,splitArea:{show:true}},visualMap:{min:0,max,calculable:false,orient:"horizontal",left:"center",bottom:0,inRange:{color:["#ecfdf5","#6ee7b7","#059669"]}},series:[{type:"heatmap",data:values,itemStyle:{borderColor:"#fff",borderWidth:2}}]};});
const stockCategoryOption=computed<EChartsCoreOption>(()=>({color:["#0ea5e9","#10b981","#8b5cf6","#f59e0b","#ec4899","#06b6d4","#84cc16","#f97316","#a8a29e"],tooltip:{trigger:"item",formatter:(p:any)=>`${p.name}<br/>${money(p.value)} · ${p.percent}%`},legend:{bottom:0,type:"scroll"},series:[{type:"pie",radius:["48%","72%"],center:["50%","43%"],padAngle:2,itemStyle:{borderRadius:5,borderColor:"#fff",borderWidth:2},label:{show:false},data:(stockReport.value?.categories||[]).map(x=>({name:categoryLabel(x.name),value:x.value}))}]}));
const stockTopOption=computed<EChartsCoreOption>(()=>{const rows=[...(stockReport.value?.top_products||[])].reverse();return{color:["#0ea5e9"],tooltip:{trigger:"axis",axisPointer:{type:"shadow"},valueFormatter:(value:any)=>money(Number(value))},grid:{left:8,right:24,top:8,bottom:20,containLabel:true},xAxis:{type:"value",axisLabel:{formatter:(v:number)=>Intl.NumberFormat("en",{notation:"compact"}).format(v)},splitLine:{lineStyle:{color:"#f5f5f4"}}},yAxis:{type:"category",data:rows.map(x=>x.name),axisLabel:{width:120,overflow:"truncate"}},series:[{type:"bar",barMaxWidth:18,itemStyle:{borderRadius:[0,5,5,0]},data:rows.map(x=>x.value)}]};});
// Received against everything that left, with sales and write-offs stacked apart
// so a spoilage correction is never mistaken for a good day of selling.
const stockMovementOption=computed<EChartsCoreOption>(()=>{const rows=stockReport.value?.movement_series||[];return{color:["#10b981","#3b82f6","#f59e0b"],tooltip:commonTooltip,legend:{bottom:0},grid:{left:10,right:16,top:24,bottom:48,containLabel:true},xAxis:{type:"category",data:rows.map(x=>x.label)},yAxis:{type:"value",minInterval:1,splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[{name:t("reportPage.stockIn"),type:"bar",barMaxWidth:22,data:rows.map(x=>x.in_qty)},{name:t("reportPage.stockSold"),type:"bar",stack:"out",barMaxWidth:22,data:rows.map(x=>x.sold_qty)},{name:t("reportPage.stockRemoved"),type:"bar",stack:"out",barMaxWidth:22,data:rows.map(x=>x.out_qty)}]};});
const trendOption=computed<EChartsCoreOption>(()=>({color:["#10b981"],tooltip:commonTooltip,grid:{left:8,right:12,top:16,bottom:28,containLabel:true},xAxis:{type:"category",data:productTrend.value.map(x=>x.label)},yAxis:{type:"value",splitLine:{lineStyle:{color:"#f5f5f4"}}},series:[{type:"line",smooth:true,areaStyle:{color:"rgba(16,185,129,.14)"},data:productTrend.value.map(x=>x.revenue)}]}));
</script>

<template><AppSidebarShell :nav-items="appNavItems" :active-ids="['reports']" :sidebar-eyebrow="t('reportPage.eyebrow')" :sidebar-title="t('reportPage.title')" sidebar-compact-title="REP" :sidebar-description="t('reportPage.sidebarDescription')"><template #default="{openSidebar}"><div class="grid w-full min-w-0 max-w-full gap-3 overflow-x-hidden pb-4">
	<AppPageHeader :title-badge="false" compact title="" body-class="px-3 py-2.5 sm:px-4 sm:py-3" @menu="openSidebar"><div class="flex min-h-10 items-center justify-between gap-3"><div class="min-w-0"><div class="flex min-w-0 items-baseline gap-2"><h1 class="shrink-0 text-base font-semibold tracking-[-0.02em] text-stone-950">{{t('reportPage.title')}}</h1><span class="truncate text-sm font-medium text-stone-600">{{periodText}}</span></div><p class="mt-0.5 text-xs text-stone-400">{{t('reportPage.updated')}} {{dashboard?.generated_at?new Date(dashboard.generated_at).toLocaleTimeString(intlLocale):'-'}}</p></div><div class="flex shrink-0 items-center gap-2"><AppButton icon="i-heroicons-arrow-down-tray-20-solid" color="neutral" variant="soft" size="md" class="self-center rounded-md" :label="t('reportPage.export')" :loading="exportBusy==='owner-report'" :disabled="!dashboard||Boolean(exportBusy)" @click="exportOwnerReport"/><AppButton icon="i-heroicons-arrow-path-20-solid" color="neutral" variant="soft" size="md" class="self-center rounded-md" :label="t('reportPage.reload')" :loading="loading" :spin-icon-on-loading="true" @click="loadDashboard"/></div></div></AppPageHeader>
	<div class="relative min-w-0 overflow-hidden rounded-md border border-stone-200 bg-white p-3 shadow-sm"><div class="grid grid-cols-3 gap-2 sm:flex sm:overflow-x-auto sm:pb-1"><AppButton v-for="preset in presets" :key="preset.id" :color="activePreset===preset.id?'primary':'neutral'" :variant="activePreset===preset.id?'solid':'soft'" :label="preset.label" class="min-w-0 justify-center sm:shrink-0" @click="activePreset=preset.id"/></div><AppDateRangePicker v-if="activePreset==='custom'" v-model:from="dateFrom" v-model:to="dateTo" class="mt-3"/><div v-if="businessPeriodText" class="mt-3 flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800"><UIcon name="i-lucide-clock-3" class="mt-0.5 size-4 shrink-0"/><span class="leading-5">{{ businessPeriodText }}</span></div><AppInlineLoadingBar v-if="dashboardRefreshing" class="pointer-events-none absolute inset-x-0 bottom-0 z-10" minimal container-class="bg-transparent" /></div>
	<div v-if="dashboardInitialLoading" class="space-y-3" aria-busy="true" :aria-label="t('reportPage.loading')">
		<div class="grid grid-cols-3 divide-x divide-stone-200 rounded-md border border-stone-200 bg-white px-1 py-2.5 shadow-sm sm:px-2"><div v-for="i in 3" :key="`headline-${i}`" class="px-2 sm:px-4"><USkeleton class="h-3 w-16 max-w-[70%] rounded-full"/><USkeleton class="mt-2 h-6 w-24 max-w-[90%] rounded-md"/></div></div>
			<div class="grid h-12 grid-cols-2 gap-2 rounded-md border border-stone-200 bg-white p-2 sm:grid-cols-5"><USkeleton v-for="i in 5" :key="`tab-${i}`" class="rounded-md"/></div>
			<div class="grid grid-cols-2 gap-3 px-2 sm:px-0 lg:grid-cols-3 xl:grid-cols-6"><div v-for="i in 6" :key="`metric-${i}`" class="h-24 rounded-md border border-stone-200 bg-white p-3 shadow-sm sm:p-4"><USkeleton class="h-3 w-20 max-w-[65%] rounded-full"/><USkeleton class="mt-4 h-6 w-28 max-w-[85%] rounded-md"/></div></div>
		<div class="grid gap-3 xl:grid-cols-[1.4fr_.6fr]"><div v-for="i in 2" :key="`chart-${i}`" class="h-80 rounded-md border border-stone-200 bg-white p-4 shadow-sm"><USkeleton class="h-4 w-36 max-w-[55%] rounded-full"/><USkeleton class="mt-6 h-[230px] w-full rounded-md"/></div></div>
	</div><div v-else-if="errorMessage" class="rounded-md border border-rose-200 bg-rose-50 p-8 text-center"><p class="font-semibold text-rose-900">{{errorMessage}}</p><AppButton class="mt-4" :label="t('reportPage.tryAgain')" @click="loadDashboard"/></div>
	<template v-else-if="dashboard">
		<!-- The three figures the owner opened the report for. They sit above the
		     tabs so every tab keeps them in view, as one line rather than cards. -->
		<div class="grid min-w-0 grid-cols-3 divide-x divide-stone-200 rounded-md border border-stone-200 bg-white px-1 py-2.5 shadow-sm sm:px-2">
			<div v-for="stat in headlineStats" :key="stat.key" class="min-w-0 px-2 sm:px-4">
				<div class="flex min-w-0 items-center gap-1.5"><p class="min-w-0 truncate text-[11px] font-medium text-stone-500">{{stat.label}}</p><span v-if="stat.delta" class="shrink-0 text-[10px]" :class="stat.delta.positive?'text-emerald-700':'text-rose-700'">{{stat.delta.text}}</span></div>
				<p class="mt-0.5 truncate text-base font-semibold tabular-nums text-stone-950 sm:text-xl">{{stat.value}}</p>
			</div>
		</div>

		<AppResponsivePanel v-model="calcOpen" :title="t('reportPage.howCalculated')" :description="t('reportPage.howCalculatedHint')" desktop-width="560px" desktop-placement="center">
			<div class="space-y-6 text-sm">
				<div v-if="salesChain">
					<p class="text-xs font-semibold uppercase tracking-wide text-stone-400">{{t('reportPage.salesChain')}}</p>
					<dl class="mt-3 space-y-1.5 tabular-nums">
						<div class="flex justify-between gap-4"><dt class="text-stone-500">{{t('reportPage.grossSales')}}</dt><dd class="font-medium text-stone-900">{{money(salesChain.gross)}}</dd></div>
						<div class="flex justify-between gap-4"><dt class="text-stone-500">− {{t('reportPage.discount')}} <span class="text-stone-400">({{t('reportPage.soldInBills',{count:salesChain.discountBills})}})</span></dt><dd class="font-medium text-stone-900">{{money(salesChain.discount)}}</dd></div>
						<div v-if="salesChain.shipping>0" class="flex justify-between gap-4"><dt class="text-stone-500">+ {{t('reportPage.shippingRevenue')}}</dt><dd class="font-medium text-stone-900">{{money(salesChain.shipping)}}</dd></div>
						<div class="flex justify-between gap-4 border-t border-stone-200 pt-1.5"><dt class="font-semibold text-stone-950">= {{t('reportPage.netSales')}}</dt><dd class="font-semibold text-stone-950">{{money(salesChain.net)}}</dd></div>
						<div class="flex justify-between gap-4 pt-1"><dt class="text-stone-400">{{t('reportPage.vatIncluded')}}</dt><dd class="text-stone-500">{{money(salesChain.vat)}}</dd></div>
						<div class="flex justify-between gap-4"><dt class="text-stone-400">{{t('reportPage.cancelRefundValue')}} <span v-if="salesChain.cancelledCount">({{t('reportPage.soldInBills',{count:salesChain.cancelledCount})}})</span></dt><dd class="text-stone-500">{{money(salesChain.cancelledAmount)}}</dd></div>
					</dl>
				</div>
				<div v-if="profitBridge">
					<p class="text-xs font-semibold uppercase tracking-wide text-stone-400">{{t('reportPage.profitChain')}}</p>
					<dl class="mt-3 space-y-1.5 tabular-nums">
						<div class="flex justify-between gap-4"><dt class="text-stone-500">{{t('reportPage.netSales')}}</dt><dd class="font-medium text-stone-900">{{money(profitBridge.revenue)}}</dd></div>
						<div v-if="profitBridge.uncosted>0" class="flex justify-between gap-4 text-amber-700"><dt>− {{t('reportPage.uncostedSales')}}</dt><dd class="font-medium">{{money(profitBridge.uncosted)}}</dd></div>
						<div v-if="profitBridge.uncosted>0" class="flex justify-between gap-4 border-t border-stone-200 pt-1.5"><dt class="text-stone-500">= {{t('reportPage.costedSales')}} <span class="text-stone-400">({{profitBridge.coverage.toFixed(0)}}%)</span></dt><dd class="font-medium text-stone-900">{{money(profitBridge.costed)}}</dd></div>
						<div class="flex justify-between gap-4"><dt class="text-stone-500">− {{t('reportPage.costOfSales')}}</dt><dd class="font-medium text-stone-900">{{money(profitBridge.cost)}}</dd></div>
						<div class="flex justify-between gap-4 border-t border-stone-200 pt-1.5"><dt class="font-semibold text-stone-950">= {{costDataComplete?t('reportPage.grossProfit'):t('reportPage.profitAtLeast')}}</dt><dd class="text-right"><span class="font-semibold text-stone-950">{{money(profitBridge.profit)}}</span><span class="ms-2 text-xs font-normal text-stone-500">{{profitBridge.margin.toFixed(1)}}%</span></dd></div>
					</dl>
					<p v-if="!costDataComplete" class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{{t('reportPage.whyAtLeast',{low:money(profitBridge.profit),high:money(profitBridge.revenue-profitBridge.cost)})}}</p>
				</div>
				<div v-if="uncostedProducts.length">
					<p class="text-xs font-semibold uppercase tracking-wide text-stone-400">{{t('reportPage.uncostedProducts')}}</p>
					<div class="mt-3 space-y-2">
						<div v-for="row in uncostedProducts" :key="row.id" class="flex flex-wrap items-center justify-between gap-2">
							<div class="min-w-0"><span class="font-medium text-stone-900">{{row.name}}</span><span class="ms-2 text-xs text-stone-400">{{t('reportPage.soldInBills',{count:row.bill_count})}}</span></div>
							<div class="flex items-center gap-3"><span class="tabular-nums text-stone-600">{{money(row.revenue)}}</span><AppButton size="xs" color="primary" variant="soft" :label="t('reportPage.setCost')" @click="openProductCost(row.id)"/></div>
						</div>
					</div>
				</div>
			</div>
		</AppResponsivePanel>

		<div class="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-stone-200 bg-white p-2 sm:flex sm:gap-2"><AppButton v-for="tab in [{id:'sales',label:t('reportPage.sales')},{id:'products',label:t('reportPage.products')},{id:'stock',label:t('reportPage.stock')},{id:'purchasing',label:t('reportPage.purchasing')},{id:'promotions',label:t('reportPage.promotions')},{id:'operations',label:t('reportPage.operations')}]" :key="tab.id" class="min-w-0 justify-center" :color="activeView===tab.id?'primary':'neutral'" :variant="activeView===tab.id?'solid':'ghost'" :label="tab.label" @click="activeView=tab.id as any"/></div>
	<template v-if="activeView==='sales'">
		<div class="flex items-center justify-between gap-3 px-2 sm:px-0"><h2 class="text-sm font-semibold text-stone-900">{{t('reportPage.salesSummary')}}</h2><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-calculator-20-solid" :label="t('reportPage.howCalculated')" @click="calcOpen=true"/></div>
		<ReportsSummaryCards :cards="salesCards" class="px-2 sm:px-0" @action="openFirstUncostedProduct"/>
		<!-- The figures that explain the headline rather than compete with it, so
		     they stay a step quieter than the cards above them. -->
		<div class="px-2 sm:px-0"><p class="mb-2 text-sm font-semibold text-stone-900">{{t('reportPage.salesDetails')}}</p><ReportsSummaryCards :cards="salesDetailCards" compact/></div>
		<div class="grid gap-3 xl:grid-cols-[1.4fr_.6fr]"><UCard><div class="flex items-center justify-between gap-2"><h2 class="font-semibold">{{t('reportPage.salesTrend')}}</h2><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportSalesSeries"/></div><ReportsReportChart :option="salesOption" :empty="!dashboard.sales_series.some(x=>x.revenue)"/></UCard><UCard><h2 class="font-semibold">{{t('reportPage.paymentMix')}}</h2><ReportsReportChart :option="donutOption" :empty="!dashboard.payment_mix.length"/></UCard></div><div class="grid gap-3 xl:grid-cols-3"><UCard><div class="flex justify-between"><h2 class="font-semibold">{{t('reportPage.revenueCostProfit')}}</h2><span v-if="dashboard.profitability.unknown_cost_bills" class="text-xs text-amber-700" :title="t('reportPage.incompleteCostBills',{count:dashboard.profitability.unknown_cost_bills})">⚠ {{t('reportPage.incompleteCost')}}</span></div><ReportsReportChart :option="profitOption" :empty="!dashboard.sales_series.some(x=>x.revenue)"/></UCard><UCard><h2 class="font-semibold">{{t('reportPage.salesByOrderType')}}</h2><ReportsReportChart :option="orderOption" :empty="!dashboard.order_type_mix.length"/></UCard><UCard><h2 class="font-semibold">{{t('reportPage.salesAndDiscount')}}</h2><ReportsReportChart :option="discountOption" :empty="!dashboard.sales_series.some(x=>x.revenue||x.discount)"/></UCard></div>
	<UCard v-if="productTypeRows.length"><div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="font-semibold">{{t('reportPage.productTypes')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.productTypesHint')}}</p></div><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportProductTypes"/></div>
		<div class="mt-4 min-w-0 overflow-x-auto"><table class="w-full min-w-[680px] text-sm"><thead><tr class="border-b border-stone-200 text-left text-xs text-stone-500"><th class="pb-2 font-medium">{{t('reportPage.productType')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.quantitySold')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.revenue')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.totalCost')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.profit')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.margin')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.costCoverage')}}</th></tr></thead><tbody>
			<tr v-for="row in productTypeRows" :key="row.mode" class="border-b border-stone-100 last:border-0">
				<td class="py-2 pe-3"><p class="font-medium text-stone-900">{{productTypeLabel(row.mode)}}</p><div class="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-stone-100"><div class="h-full rounded-full" :class="row.mode==='untracked'?'bg-amber-400':'bg-emerald-500'" :style="{width:Math.min(100,row.revenue_share_percent)+'%'}"/></div><p class="mt-0.5 text-xs text-stone-400">{{row.revenue_share_percent.toFixed(1)}}%</p></td>
				<td class="py-2 text-right tabular-nums">{{num(row.quantity)}}</td>
				<td class="py-2 text-right font-medium tabular-nums">{{money(row.revenue)}}</td>
				<td class="py-2 text-right tabular-nums text-stone-500">{{money(row.known_cost)}}<span v-if="row.gift_cost" class="mt-0.5 block text-xs text-stone-400">{{t('reportPage.giftCostIncluded')}} {{money(row.gift_cost)}}</span></td>
				<td class="py-2 text-right font-medium tabular-nums">{{money(row.gross_profit)}}</td>
				<td class="py-2 text-right tabular-nums text-stone-500">{{row.margin.toFixed(1)}}%</td>
				<td class="py-2 text-right"><span class="font-medium tabular-nums" :class="row.cost_coverage_percent>=100?'text-emerald-700':'text-amber-700'">{{row.cost_coverage_percent.toFixed(0)}}%</span><span v-if="row.unknown_cost_revenue>0" class="mt-0.5 block text-xs leading-4 text-amber-700">⚠ {{t('reportPage.uncostedRevenue',{amount:money(row.unknown_cost_revenue),count:row.unknown_cost_products})}}</span></td>
			</tr>
		</tbody></table></div>
	</UCard>
	<!-- Sits above the per-account table: the owner reads "how much do I collect"
	     before "which account did it land in". -->
	<UCard v-if="showTakings&&cashTakings">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div><h2 class="font-semibold">{{t('reportPage.takings')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.takingsHint')}}</p></div>
			<AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportTakings"/>
		</div>
		<div class="mt-4 grid gap-4 md:grid-cols-2">
			<div class="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
				<p class="text-xs font-semibold uppercase tracking-wide text-emerald-800">{{t('reportPage.takingsDrawer')}}</p>
				<dl class="mt-2 space-y-2">
					<div v-for="entry in cashTakings.drawer" :key="entry.currency" class="flex items-baseline justify-between gap-3">
						<dt class="text-sm text-stone-600">{{entry.currency}}<span class="ms-1.5 text-xs text-stone-400">{{t('reportPage.billsShort',{count:num(entry.bill_count)})}}</span></dt>
						<dd class="text-right">
							<!-- The figure to count is the one in the customer's currency;
							     the kip equivalent is context, not something to count. -->
							<span class="block text-base font-semibold tabular-nums text-stone-900">{{foreignMoney(entry.amount,entry.currency)}}</span>
							<span v-if="entry.currency!==cashTakings.base_currency" class="block text-xs tabular-nums text-stone-500">= {{money(entry.amount_base)}}</span>
						</dd>
					</div>
					<p v-if="!cashTakings.drawer.length" class="text-sm text-stone-500">{{t('reportPage.takingsNoCash')}}</p>
				</dl>
			</div>
			<div class="rounded-md border border-stone-200 p-3">
				<p class="text-xs font-semibold uppercase tracking-wide text-stone-500">{{t('reportPage.takingsBanked')}}</p>
				<dl class="mt-2 space-y-2">
					<div v-for="row in paymentAccountRows" :key="row.id" class="flex items-baseline justify-between gap-3">
						<dt class="min-w-0 truncate text-sm text-stone-600">{{accountLabel(row)}}<span v-if="row.currency&&row.currency!==cashTakings.base_currency" class="ms-1.5 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600">{{row.currency}}</span></dt>
						<dd class="shrink-0 text-sm font-medium tabular-nums text-stone-900">{{money(row.amount)}}</dd>
					</div>
					<div v-if="cashTakings.card_amount" class="flex items-baseline justify-between gap-3">
						<dt class="text-sm text-stone-600">{{t('reportPage.creditCard')}}</dt>
						<dd class="text-sm font-medium tabular-nums text-stone-900">{{money(cashTakings.card_amount)}}</dd>
					</div>
					<p v-if="!paymentAccountRows.length&&!cashTakings.card_amount" class="text-sm text-stone-500">{{t('reportPage.takingsNoBank')}}</p>
				</dl>
			</div>
		</div>
		<!-- If this line does not match the period revenue, a bill lost its rate. -->
		<div v-if="takingsCheck" class="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-stone-200 pt-3">
			<span class="text-sm font-medium text-stone-700">{{t('reportPage.takingsTotal')}}</span>
			<span class="text-right">
				<strong class="block tabular-nums" :class="takingsCheck.balanced?'text-stone-900':'text-amber-700'">{{money(takingsCheck.collected)}}</strong>
				<span class="block text-xs" :class="takingsCheck.balanced?'text-stone-500':'text-amber-700'">{{takingsCheck.balanced?t('reportPage.takingsBalanced'):t('reportPage.takingsUnbalanced',{amount:money(takingsCheck.revenue)})}}</span>
			</span>
		</div>
		<div v-if="currencyRows.length>1" class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
			<div v-for="entry in currencyRows" :key="entry.currency" class="rounded-md border border-stone-200 p-3">
				<p class="text-xs font-medium text-stone-500">{{t('reportPage.takingsReceivedIn',{currency:entry.currency})}}</p>
				<p class="mt-1 text-base font-semibold tabular-nums text-stone-900">{{entry.amount_foreign===null?money(entry.amount_base):foreignMoney(entry.amount_foreign,entry.currency)}}</p>
				<p v-if="entry.amount_foreign!==null" class="text-xs tabular-nums text-stone-500">= {{money(entry.tendered_base)}}</p>
				<p v-if="entry.change_base>0" class="mt-1 text-xs font-medium tabular-nums text-amber-700">{{t('reportPage.takingsChange')}} {{money(entry.change_base)}}</p>
				<p v-if="entry.amount_foreign!==null" class="mt-1 text-xs text-stone-500">{{t('reportPage.takingsSalesValue')}} {{money(entry.amount_base)}}</p>
				<p class="mt-1 text-xs text-stone-400">{{t('reportPage.billsShort',{count:num(entry.bill_count)})}} · {{num(entry.percent)}}%<span v-if="!entry.is_base"> · {{t('reportPage.takingsAverageRate',{rate:num(Math.round(entry.exchange_rate))})}}</span></p>
			</div>
		</div>
	</UCard>
	<UCard v-if="paymentAccountRows.length"><div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="font-semibold">{{t('reportPage.paymentAccounts')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.paymentAccountsHint')}}</p></div><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportPaymentAccounts"/></div>
		<div class="mt-4 grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
			<ReportsReportChart :option="accountOption" :empty="!paymentAccountRows.some(x=>x.amount)"/>
			<div class="min-w-0 overflow-x-auto"><table class="w-full min-w-[520px] text-sm"><thead><tr class="border-b border-stone-200 text-left text-xs text-stone-500"><th class="pb-2 font-medium">{{t('reportPage.account')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.bills')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.amount')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.share')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.averageBill')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.lastReceived')}}</th></tr></thead><tbody>
				<tr v-for="row in paymentAccountRows" :key="row.id" class="border-b border-stone-100 last:border-0">
					<td class="py-2 pe-3"><div class="flex flex-wrap items-center gap-1.5"><span class="font-medium" :class="row.id==='unassigned'?'text-amber-700':'text-stone-900'">{{accountLabel(row)}}</span><span v-if="row.id!=='unassigned'&&!row.is_active" class="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">{{t('reportPage.accountInactive')}}</span><span v-if="row.id!=='unassigned'&&!row.has_qr" class="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">{{t('reportPage.accountNoQr')}}</span></div><p v-if="row.id==='unassigned'" class="mt-0.5 text-xs leading-4 text-amber-700">{{t('reportPage.unassignedAccountHint')}}</p><p v-else-if="row.account_number" class="mt-0.5 text-xs text-stone-400 tabular-nums">{{accountMaskedNumber(row.account_number)}}</p></td>
					<td class="py-2 text-right tabular-nums">{{num(row.bill_count)}}</td>
					<td class="py-2 text-right font-medium tabular-nums">{{money(row.amount)}}</td>
					<td class="py-2 text-right tabular-nums text-stone-500">{{row.percent.toFixed(1)}}%</td>
					<td class="py-2 text-right tabular-nums text-stone-500">{{money(row.average_bill)}}</td>
					<td class="py-2 text-right text-xs text-stone-500">{{row.last_paid_at?shortDate(row.last_paid_at):'-'}}</td>
				</tr>
			</tbody></table></div>
		</div>
	</UCard>
	</template>
		<template v-else-if="activeView==='stock'">
			<div v-if="stockLoading && !stockReport" class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6"><div v-for="n in 6" :key="n" class="h-24 rounded-md border border-stone-200 bg-white p-3 shadow-sm"><USkeleton class="h-3 w-20 max-w-[65%] rounded-full"/><USkeleton class="mt-4 h-6 w-28 max-w-[85%] rounded-md"/></div></div>
			<template v-else-if="stockReport">
				<div class="px-2 sm:px-0"><p class="mb-2 text-sm font-semibold text-stone-900">{{t('reportPage.stockSummary')}}</p><ReportsSummaryCards :cards="stockCards"/></div>
				<div class="grid min-w-0 gap-3 [&>*]:min-w-0 xl:grid-cols-[1.4fr_.6fr]">
					<UCard><div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="font-semibold">{{t('reportPage.stockMovementChart')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.stockMovementChartHint')}}</p></div></div><ReportsReportChart :option="stockMovementOption" :empty="!stockReport.movement_series.some(x=>x.in_qty||x.sold_qty||x.out_qty)"/></UCard>
					<UCard><div class="flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">{{t('reportPage.stockValueByCategory')}}</h2><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportStockCategories"/></div><ReportsReportChart :option="stockCategoryOption" :empty="!stockReport.categories.length"/></UCard>
				</div>
				<div class="grid min-w-0 gap-3 [&>*]:min-w-0 xl:grid-cols-2">
					<UCard><div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="font-semibold">{{t('reportPage.topStockValue')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.topStockValueHint')}}</p></div><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportStockValue"/></div><ReportsReportChart :option="stockTopOption" :empty="!stockReport.top_products.length"/>
						<div v-if="stockReport.top_products.length" class="mt-4 min-w-0 overflow-x-auto"><table class="w-full min-w-[520px] text-sm"><thead><tr class="border-b border-stone-200 text-left text-xs text-stone-500"><th class="pb-2 font-medium">{{t('reportPage.product')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.onHand')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.unitCost')}}</th><th class="pb-2 text-right font-medium">{{t('reportPage.inventoryValue')}}</th></tr></thead><tbody>
							<tr v-for="item in stockReport.top_products" :key="item.id" class="border-b border-stone-100 last:border-0"><td class="py-2 pe-3"><p class="font-medium text-stone-900">{{item.name}}</p><p class="text-xs text-stone-400">{{item.sku}}</p></td><td class="py-2 text-right tabular-nums">{{num(item.on_hand_base)}}</td><td class="py-2 text-right tabular-nums text-stone-500">{{money(item.unit_cost)}}</td><td class="py-2 text-right font-medium tabular-nums">{{money(item.value)}}</td></tr>
						</tbody></table></div>
					</UCard>
					<UCard><div class="flex items-center justify-between gap-2"><h2 class="font-semibold">{{t('reportPage.restockProducts')}}</h2><div class="flex shrink-0 items-center gap-2"><span class="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700" :title="t('reportPage.asOfNowHint')">{{t('reportPage.asOfNow')}}</span><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportLowStock"/></div></div><div v-if="stockReport.low_stock.length" class="mt-4 grid gap-2 sm:grid-cols-2"><div v-for="item in stockReport.low_stock" :key="item.id" class="rounded-md border border-amber-200 bg-amber-50 p-3"><p class="truncate font-semibold">{{item.name}}</p><div class="mt-1 flex justify-between text-xs"><span>{{item.sku}}</span><strong class="text-amber-800">{{num(item.available_base)}} / {{num(item.threshold)}}</strong></div></div></div><p v-else class="py-16 text-center text-sm text-stone-500">{{t('reportPage.stockNormal')}}</p></UCard>
				</div>
			</template>
			<p v-else class="rounded-md border border-stone-200 bg-white py-16 text-center text-sm text-stone-500">{{t('reportPage.noStockData')}}</p>
		</template>
		<template v-else-if="activeView==='purchasing'">
			<div v-if="purchasingLoading && !purchasingReport" class="grid grid-cols-2 gap-3 lg:grid-cols-4"><div v-for="n in 4" :key="n" class="h-24 rounded-md border border-stone-200 bg-white p-3 shadow-sm"><USkeleton class="h-3 w-20 max-w-[65%] rounded-full"/><USkeleton class="mt-4 h-6 w-28 max-w-[85%] rounded-md"/></div></div>
			<template v-else-if="purchasingReport">
				<div class="px-2 sm:px-0"><p class="mb-2 text-sm font-semibold text-stone-900">{{t('reportPage.purchasingSummary')}}</p><ReportsSummaryCards :cards="purchasingCards" columns="grid-cols-2 lg:grid-cols-4"/></div>

				<div class="grid gap-3 sm:grid-cols-2"><div class="rounded-md border border-amber-200 bg-amber-50 p-4"><div class="flex items-center justify-between gap-2"><p class="text-xs font-medium text-amber-800">{{t('reportPage.payable')}}</p><span class="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700" :title="t('reportPage.asOfNowHint')">{{t('reportPage.asOfNow')}}</span></div><strong class="mt-1 block text-xl tabular-nums text-amber-900">{{money(purchasingReport.payable.amount)}}</strong><p class="mt-1 text-[11px] text-amber-700">{{t('reportPage.payableHint',{count:purchasingReport.payable.po_count})}}</p></div><div class="rounded-md border border-sky-200 bg-sky-50 p-4"><div class="flex items-center justify-between gap-2"><p class="text-xs font-medium text-sky-800">{{t('reportPage.outstandingStock')}}</p><span class="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700" :title="t('reportPage.asOfNowHint')">{{t('reportPage.asOfNow')}}</span></div><strong class="mt-1 block text-xl tabular-nums text-sky-900">{{money(purchasingReport.outstanding.amount)}}</strong><p class="mt-1 text-[11px] text-sky-700">{{t('reportPage.outstandingStockHint',{count:purchasingReport.outstanding.po_count,qty:num(purchasingReport.outstanding.qty)})}}</p></div></div>

				<div class="grid min-w-0 gap-3 [&>*]:min-w-0 xl:grid-cols-[1.4fr_.6fr]"><UCard><h2 class="font-semibold">{{t('reportPage.spendTrend')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.spendTrendHint')}}</p><ReportsReportChart :option="purchasingTrendOption" :empty="!purchasingReport.spend_series.some(x=>x.total_spend)"/></UCard><UCard><h2 class="font-semibold">{{t('reportPage.supplierMix')}}</h2><ReportsReportChart :option="purchasingSupplierOption" :empty="!purchasingReport.suppliers.length"/></UCard></div>

				<UCard><h2 class="font-semibold">{{t('reportPage.costComposition')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.costCompositionHint',{percent:purchasingReport.summary.extra_cost_percent.toFixed(1)})}}</p><ReportsReportChart :option="purchasingCostMixOption" :empty="!purchasingReport.spend_series.some(x=>x.total_spend)"/></UCard>

				<UCard>
					<div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold">{{t('reportPage.purchasedProducts')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.purchasedProductsHint')}}</p></div><div class="flex shrink-0 items-center gap-2"><span class="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{{purchasingReport.products.length}}</span><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportPurchasedProducts"/></div></div>
					<div v-if="purchasingReport.products.length" class="mt-4 overflow-x-auto"><table class="min-w-[860px] w-full text-sm"><thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{t('reportPage.product')}}</th><th class="p-3 text-right">{{t('reportPage.qtyOrdered')}}</th><th class="p-3 text-right">{{t('reportPage.qtyReceived')}}</th><th class="p-3 text-right">{{t('reportPage.qtyOutstanding')}}</th><th class="p-3 text-right">{{t('reportPage.goodsCost')}}</th><th class="p-3 text-right">{{t('reportPage.shippingCostLabel')}}</th><th class="p-3 text-right">{{t('reportPage.landedUnitCost')}}</th><th class="p-3 text-right">{{t('reportPage.totalSpend')}}</th></tr></thead><tbody><tr v-for="item in purchasingReport.products" :key="item.id" class="border-t border-stone-100"><td class="p-3"><strong>{{item.name}}</strong><p class="text-xs text-stone-400">{{item.sku}}</p></td><td class="p-3 text-right">{{num(item.qty_ordered)}}</td><td class="p-3 text-right">{{num(item.qty_received)}}</td><td class="p-3 text-right" :class="item.qty_outstanding>0?'font-semibold text-sky-700':'text-stone-400'">{{item.qty_outstanding>0?num(item.qty_outstanding):'–'}}</td><td class="p-3 text-right">{{money(item.goods_cost)}}</td><td class="p-3 text-right" :class="item.freight_cost>0?'text-amber-700':'text-stone-400'">{{item.freight_cost>0?money(item.freight_cost):'–'}}</td><td class="p-3 text-right font-semibold">{{money(item.landed_unit_cost)}}</td><td class="p-3 text-right font-semibold">{{money(item.total_cost)}}</td></tr></tbody></table></div>
					<p v-else class="py-8 text-center text-sm text-stone-500">{{t('reportPage.noPurchaseData')}}</p>
				</UCard>
				<UCard>
					<div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold">{{t('reportPage.spendBySupplier')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.spendBySupplierHint')}}</p></div><div class="flex shrink-0 items-center gap-2"><span class="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{{purchasingReport.suppliers.length}}</span><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportSuppliers"/></div></div>
					<div v-if="purchasingReport.suppliers.length" class="mt-4 overflow-x-auto"><table class="min-w-[520px] w-full text-sm"><thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{t('reportPage.supplier')}}</th><th class="p-3 text-right">{{t('reportPage.poCount')}}</th><th class="p-3 text-right">{{t('reportPage.totalSpend')}}</th><th class="p-3 text-right">{{t('reportPage.share')}}</th></tr></thead><tbody><tr v-for="supplier in purchasingReport.suppliers" :key="supplier.supplier_name" class="border-t border-stone-100"><td class="p-3 font-semibold">{{supplier.supplier_name||t('reportPage.unspecifiedSupplier')}}</td><td class="p-3 text-right">{{num(supplier.po_count)}}</td><td class="p-3 text-right font-semibold">{{money(supplier.total_spend)}}</td><td class="p-3 text-right">{{purchasingReport.summary.total_spend?((supplier.total_spend/purchasingReport.summary.total_spend)*100).toFixed(1):'0.0'}}%</td></tr></tbody></table></div>
					<p v-else class="py-8 text-center text-sm text-stone-500">{{t('reportPage.noPurchaseData')}}</p>
				</UCard>
				<UCard>
					<div class="flex items-center justify-between gap-2"><h2 class="font-semibold">{{t('reportPage.poStatusMix')}}</h2><span class="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700" :title="t('reportPage.asOfNowHint')">{{t('reportPage.asOfNow')}}</span></div>
					<p class="mt-1 text-xs text-stone-500">{{t('reportPage.poStatusMixHint')}}</p>
					<div v-if="purchasingReport.status_mix.length" class="mt-4 flex flex-wrap gap-2"><span v-for="row in purchasingReport.status_mix" :key="row.status" class="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm"><b class="tabular-nums">{{num(row.po_count)}}</b> · {{row.status}}</span></div>
					<p v-else class="py-8 text-center text-sm text-stone-500">{{t('reportPage.noPurchaseData')}}</p>
				</UCard>
			</template>
			<p v-else class="py-12 text-center text-sm text-stone-500">{{t('reportPage.noPurchaseData')}}</p>
		</template>
		<template v-else-if="activeView==='promotions'"><div class="px-2 sm:px-0"><p class="mb-2 text-sm font-semibold text-stone-900">{{t('reportPage.promotionSummary')}}</p><ReportsSummaryCards :cards="promotionCards" columns="grid-cols-2 lg:grid-cols-4"/></div><div class="grid min-w-0 gap-3 [&>*]:min-w-0 xl:grid-cols-2"><UCard><h2 class="font-semibold">{{t('reportPage.promotionValueChart')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.promotionValueChartHint')}}</p><ReportsReportChart :option="promotionValueOption" :empty="!dashboard.promotion_performance.some(x=>x.discount_amount||x.gift_cost)"/></UCard><UCard><h2 class="font-semibold">{{t('reportPage.promotionUsageChart')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.promotionUsageChartHint')}}</p><ReportsReportChart :option="promotionUsageOption" :empty="!dashboard.promotion_performance.length"/></UCard></div><UCard><div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold">{{t('reportPage.promotionPerformance')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.promotionPerformanceHint')}}</p></div><div class="flex shrink-0 items-center gap-2"><span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{{dashboard.promotion_performance.length}}</span><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportPromotions"/></div></div><div v-if="dashboard.promotion_performance.length" class="mt-4 overflow-x-auto"><table class="min-w-[700px] w-full text-sm"><thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{t('reportPage.promotion')}}</th><th class="p-3 text-right">{{t('reportPage.bills')}}</th><th class="p-3 text-right">{{t('reportPage.applications')}}</th><th class="p-3 text-right">{{t('reportPage.giftQuantity')}}</th><th class="p-3 text-right">{{t('reportPage.giftCost')}}</th><th class="p-3 text-right">{{t('reportPage.promotionDiscount')}}</th></tr></thead><tbody><tr v-for="promotion in dashboard.promotion_performance" :key="promotion.promotion_id" class="border-t border-stone-100"><td class="p-3 font-semibold">{{promotion.name}}</td><td class="p-3 text-right">{{num(promotion.bill_count)}}</td><td class="p-3 text-right">{{num(promotion.applications)}}</td><td class="p-3 text-right">{{num(promotion.gift_quantity)}}</td><td class="p-3 text-right">{{money(promotion.gift_cost)}}</td><td class="p-3 text-right">{{money(promotion.discount_amount)}}</td></tr></tbody></table></div><p v-else class="py-8 text-center text-sm text-stone-500">{{t('reportPage.noPromotionData')}}</p></UCard></template>
		<template v-else-if="activeView==='products'">
		<div v-if="productsInitialLoading||productCards.length" class="px-2 sm:px-0"><p class="mb-2 text-sm font-semibold text-stone-900">{{t('reportPage.productSummary')}}</p>
			<div v-if="productsInitialLoading" class="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-6"><div v-for="n in 6" :key="n" class="h-24 rounded-md border border-stone-200 bg-white p-3 shadow-sm"><USkeleton class="h-3 w-20 max-w-[65%] rounded-full"/><USkeleton class="mt-4 h-6 w-28 max-w-[85%] rounded-md"/></div></div>
			<ReportsSummaryCards v-else :cards="productCards" @action="openFirstUncostedProduct"/>
		</div>
		<div class="grid min-w-0 gap-3 [&>*]:min-w-0 xl:grid-cols-2"><UCard><div class="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"><h2 class="font-semibold">{{t('reportPage.bestSellers')}}</h2><div class="flex gap-1"><AppButton size="xs" :variant="productMetric==='revenue'?'solid':'soft'" :label="t('reportPage.revenue')" @click="productMetric='revenue'"/><AppButton size="xs" :variant="productMetric==='quantity'?'solid':'soft'" :label="t('reportPage.quantity')" @click="productMetric='quantity'"/></div></div><ReportsReportChart :option="productOption" :empty="!dashboard.top_products.length"/></UCard><UCard><div class="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3"><div class="min-w-0"><h2 class="font-semibold">{{t('reportPage.productSalesMix')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.productSalesMixHint')}}</p></div><div class="flex shrink-0 gap-1"><AppButton size="xs" :variant="productShareMetric==='revenue'?'solid':'soft'" :label="t('reportPage.revenue')" @click="productShareMetric='revenue'"/><AppButton size="xs" :variant="productShareMetric==='quantity'?'solid':'soft'" :label="t('reportPage.quantity')" @click="productShareMetric='quantity'"/></div></div><ReportsReportChart :option="productShareOption" :empty="!dashboard.product_mix.some(x=>productShareMetric==='revenue'?x.revenue:x.quantity)"/></UCard></div>
	<UCard><h2 class="font-semibold">{{t('reportPage.categoryRevenueProfit')}}</h2><ReportsReportChart :option="categoryOption" :empty="!dashboard.category_performance.length"/></UCard>
		<UCard><div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold">{{t('reportPage.categoryDetails')}}</h2><p class="text-xs text-stone-500">{{t('reportPage.categoryCostHint')}}</p></div><div class="flex shrink-0 items-center gap-2"><span class="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{{t('reportPage.categoryCount',{count:dashboard.category_performance.length})}}</span><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportCategories"/></div></div><div class="mt-4 overflow-x-auto"><table class="min-w-[860px] w-full text-sm"><thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{t('reportPage.category')}}</th><th class="p-3 text-right">{{t('reportPage.quantitySold')}}</th><th class="p-3 text-right">{{t('reportPage.revenue')}}</th><th class="p-3 text-right">{{t('reportPage.totalCost')}}</th><th class="p-3 text-right">{{t('reportPage.giftCostIncluded')}}</th><th class="p-3 text-right">{{t('reportPage.profit')}}</th><th class="p-3 text-right">{{t('reportPage.margin')}}</th><th class="p-3 text-right">{{t('reportPage.costCoverage')}}</th></tr></thead><tbody><tr v-for="category in dashboard.category_performance" :key="category.id" class="border-t border-stone-100"><td class="p-3 font-semibold">{{categoryLabel(category.name)}}</td><td class="p-3 text-right">{{num(category.quantity)}}</td><td class="p-3 text-right font-semibold">{{money(category.revenue)}}</td><td class="p-3 text-right">{{money(category.known_cost)}}</td><td class="p-3 text-right text-amber-700">{{money(category.gift_cost)}}</td><td class="p-3 text-right text-emerald-700">{{money(category.gross_profit)}}</td><td class="p-3 text-right">{{category.margin.toFixed(1)}}%</td><td class="p-3 text-right" :class="category.cost_coverage_percent<100?'text-amber-700':'text-stone-700'">{{category.cost_coverage_percent.toFixed(1)}}%</td></tr></tbody></table></div></UCard>
		<UCard class="relative overflow-hidden"><AppInlineLoadingBar v-if="productsRefreshing" class="pointer-events-none absolute inset-x-0 top-0 z-10" minimal container-class="bg-transparent" /><div class="flex flex-wrap items-start justify-between gap-2"><div><h2 class="font-semibold">{{t('reportPage.allProductReport')}}</h2><p class="text-xs text-stone-500">{{t('reportPage.productsInPeriod',{count:productReport?.pagination.total||0})}}</p><p class="mt-1 text-[11px] text-amber-700">{{t('reportPage.productProfitExcludesGiftHint')}}</p></div><div class="flex flex-wrap items-center gap-2"><input v-model="productSearch" :placeholder="t('reportPage.searchProduct')" class="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-2 text-sm"><select v-model="productCategory" class="rounded-md border border-stone-300 px-3 py-2 text-sm"><option value="">{{t('reportPage.allCategories')}}</option><option v-for="category in productReport?.categories" :key="category.id" :value="category.id">{{categoryLabel(category.name)}}</option></select><select v-model="productSort" class="rounded-md border border-stone-300 px-3 py-2 text-sm"><option value="revenue">{{t('reportPage.revenue')}}</option><option value="quantity">{{t('reportPage.quantitySold')}}</option><option value="average_price">{{t('reportPage.averagePrice')}}</option><option value="cost">{{t('reportPage.cost')}}</option><option value="profit">{{t('reportPage.profit')}}</option><option value="margin">{{t('reportPage.margin')}}</option></select><AppButton color="neutral" variant="soft" :icon="productOrder==='desc'?'i-heroicons-bars-arrow-down':'i-heroicons-bars-arrow-up'" :label="t(productOrder==='desc'?'reportPage.highToLow':'reportPage.lowToHigh')" @click="productOrder=productOrder==='desc'?'asc':'desc'"/><AppButton size="sm" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" :loading="exportBusy==='products'" :spin-icon-on-loading="true" :disabled="exportBusy==='products'" @click="exportAllProducts"/></div></div>
	<div v-if="productsInitialLoading" class="mt-4" aria-busy="true" :aria-label="t('reportPage.loadingProducts')"><div class="space-y-2 md:hidden"><div v-for="i in 5" :key="`mobile-product-${i}`" class="h-24 rounded-md border border-stone-200 bg-white p-3 shadow-sm"><USkeleton class="h-4 w-2/3 rounded-full"/><USkeleton class="mt-3 h-3 w-1/3 rounded-full"/><USkeleton class="mt-3 h-4 w-1/2 rounded-full"/></div></div><div class="hidden overflow-hidden rounded-md border border-stone-200 bg-white shadow-sm md:block"><div class="border-b border-stone-200 bg-white p-3"><USkeleton class="h-4 w-full rounded-md"/></div><div v-for="i in 7" :key="`product-row-${i}`" class="border-b border-stone-100 bg-white p-3 last:border-b-0"><USkeleton class="h-8 w-full rounded-md"/></div></div></div>
	<template v-else>
	<div class="mt-4 space-y-2 md:hidden"><button v-for="item in productReport?.items" :key="item.id" class="w-full rounded-md border border-stone-200 p-3 text-left" @click="openProduct(item)"><div class="flex justify-between gap-3"><div class="min-w-0"><p class="truncate font-semibold">{{item.name}}</p><p class="text-xs text-stone-400">{{item.sku}} · {{categoryLabel(item.category_name)}}</p></div><strong class="text-emerald-700">{{money(item.revenue)}}</strong></div><div class="mt-3 grid grid-cols-3 gap-2 text-xs"><span>{{t('reportPage.sold')}} <b>{{num(item.quantity)}}</b></span><span>{{t('reportPage.profit')}} <b>{{money(item.gross_profit)}}</b></span><span>{{t('reportPage.margin')}} <b>{{item.margin.toFixed(1)}}%</b></span></div></button></div>
	<div class="mt-4 hidden overflow-x-auto md:block"><table class="min-w-[1050px] w-full text-sm"><thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{t('reportPage.product')}}</th><th class="p-3">{{t('reportPage.category')}}</th><th class="p-3 text-right">{{t('reportPage.quantity')}}</th><th class="p-3 text-right">{{t('reportPage.averagePrice')}}</th><th class="p-3 text-right">{{t('reportPage.revenue')}}</th><th class="p-3 text-right">{{t('reportPage.unitCost')}}</th><th class="p-3 text-right">{{t('reportPage.cost')}}</th><th class="p-3 text-right">{{t('reportPage.profit')}}</th><th class="p-3 text-right">{{t('reportPage.margin')}}</th><th class="p-3 text-right">{{t('reportPage.bills')}}</th></tr></thead><tbody><tr v-for="item in productReport?.items" :key="item.id" class="cursor-pointer border-t border-stone-100 hover:bg-emerald-50/40" @click="openProduct(item)"><td class="p-3"><strong>{{item.name}}</strong><p class="text-xs text-stone-400">{{item.sku}}</p></td><td class="p-3">{{categoryLabel(item.category_name)}}</td><td class="p-3 text-right">{{num(item.quantity)}}</td><td class="p-3 text-right">{{money(item.average_price)}}</td><td class="p-3 text-right font-semibold">{{money(item.revenue)}}</td><td class="p-3 text-right">{{item.quantity>0?money(item.known_cost/item.quantity):'–'}}</td><td class="p-3 text-right"><span class="inline-flex items-center gap-1">{{money(item.known_cost)}}<span v-if="item.unknown_cost_revenue>0" class="text-amber-600" :title="t('reportPage.partialCostHint',{amount:money(item.unknown_cost_revenue)})">⚠</span></span></td><td class="p-3 text-right text-emerald-700">{{money(item.gross_profit)}}</td><td class="p-3 text-right">{{item.margin.toFixed(1)}}%</td><td class="p-3 text-right">{{item.bill_count}}</td></tr></tbody></table></div><div v-if="!productReport?.items.length" class="py-12 text-center text-sm text-stone-500">{{t('reportPage.noProducts')}}</div><div class="mt-3 flex justify-end gap-2"><AppButton color="neutral" variant="soft" :label="t('reportPage.previous')" :disabled="productPage<=1||productLoading" @click="productPage--"/><span class="self-center text-sm">{{productPage}} / {{productReport?.pagination.pages||1}}</span><AppButton color="neutral" variant="soft" :label="t('reportPage.next')" :disabled="productPage>=(productReport?.pagination.pages||1)||productLoading" @click="productPage++"/></div>
	</template></UCard></template>
	<template v-else>
		<div class="px-2 sm:px-0"><p class="mb-2 text-sm font-semibold text-stone-900">{{t('reportPage.operationsSummary')}}</p><ReportsSummaryCards :cards="operationCards" columns="grid-cols-2 lg:grid-cols-4"/></div>
		<UCard><div class="flex flex-wrap items-center justify-between gap-2"><div><h2 class="font-semibold">{{t('reportPage.peakSalesTimes')}}</h2><p class="mt-1 text-xs text-stone-500">{{t('reportPage.peakSalesTimesHint')}}</p></div><div class="flex shrink-0 gap-1"><AppButton size="xs" :variant="heatMetric==='revenue'?'solid':'soft'" :label="t('reportPage.revenue')" @click="heatMetric='revenue'"/><AppButton size="xs" :variant="heatMetric==='bill_count'?'solid':'soft'" :label="t('reportPage.bills')" @click="heatMetric='bill_count'"/></div></div><ReportsReportChart :option="heatOption" height="360px" :empty="!dashboard.heatmap.length"/></UCard>
		<UCard><div class="flex items-center justify-between gap-2"><h2 class="font-semibold">{{t('reportPage.staffPerformance')}}</h2><AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-down-tray-20-solid" :label="t('reportPage.export')" @click="exportStaff"/></div><div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3"><div v-for="(staff,index) in dashboard.staff_ranking" :key="staff.id" class="flex items-center gap-3 rounded-md border border-stone-200 p-3"><span class="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 font-semibold text-emerald-700">{{index+1}}</span><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{staff.name}}</p><p class="text-xs text-stone-500">{{t('reportPage.staffSummary',{bills:staff.bill_count,average:money(staff.average_bill)})}}</p></div><strong>{{money(staff.revenue)}}</strong></div></div></UCard>
	</template>
	</template></div>
	<div v-if="selectedProduct" class="fixed inset-0 z-50 flex justify-end bg-stone-950/35" @click.self="selectedProduct=null"><aside class="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl"><div class="flex justify-between"><div><h2 class="text-xl font-semibold">{{selectedProduct.name}}</h2><p class="text-sm text-stone-500">{{selectedProduct.sku}} · {{periodText}}</p></div><AppButton icon="i-heroicons-x-mark" color="neutral" variant="soft" @click="selectedProduct=null"/></div><div class="mt-5 grid grid-cols-2 gap-3"><div class="rounded-md bg-stone-50 p-3"><p class="text-xs text-stone-500">{{t('reportPage.revenue')}}</p><strong>{{money(selectedProduct.revenue)}}</strong></div><div class="rounded-md bg-stone-50 p-3"><p class="text-xs text-stone-500">{{t('reportPage.quantitySold')}}</p><strong>{{num(selectedProduct.quantity)}}</strong></div><div class="rounded-md bg-stone-50 p-3"><p class="text-xs text-stone-500">{{t('reportPage.profit')}}</p><strong>{{money(selectedProduct.gross_profit)}}</strong></div><div class="rounded-md bg-stone-50 p-3"><p class="text-xs text-stone-500">{{t('reportPage.margin')}}</p><strong>{{selectedProduct.margin.toFixed(1)}}%</strong></div></div><div v-if="trendLoading" class="mt-5 h-80 rounded-md border border-stone-200 bg-white p-4 shadow-sm"><USkeleton class="h-4 w-36 rounded-full"/><USkeleton class="mt-6 h-[230px] w-full rounded-md"/></div><ReportsReportChart v-else class="mt-5" :option="trendOption" :empty="!productTrend.length"/></aside></div>
	</template></AppSidebarShell></template>
