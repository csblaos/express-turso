import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { InventoryCostInterface } from "@interfaces/InventoryCostInterface";
import { ensureOrderPaymentColumns } from "@interfaces/OrderInterface";
import { StoreInterface } from "@interfaces/StoreInterface";
import { StorePaymentAccountInterface } from "@interfaces/StorePaymentAccountInterface";
import { ApiError } from "@middlewares/ApiError";

export type ReportPreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom" | "7d" | "30d";
export type ProductReportSort = "quantity" | "average_price" | "revenue" | "cost" | "profit" | "margin";
type Period = { from: string; to: string; date_from: string; date_to: string; days: number };
export type ReportPeriodInput = { preset: ReportPreset; dateFrom?: string; dateTo?: string; timezoneOffset: number; businessDayStartMinutes?: number };

const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function number(value: unknown): number { const parsed=Number(value); return Number.isFinite(parsed)?parsed:0; }
function row(result:any):Record<string,unknown>{return(result?.rows?.[0]||{}) as Record<string,unknown>;}
function localDate(ms:number,offsetMs:number):string{return new Date(ms+offsetMs).toISOString().slice(0,10);}
function utcFromLocalDate(value:string,offsetMs:number):number{
	if(!DATE_RE.test(value)) throw ApiError.BadRequestError("Invalid report date");
	const [year,month,day]=value.split("-").map(Number); const valueMs=Date.UTC(year,month-1,day)-offsetMs;
	if(localDate(valueMs,offsetMs)!==value) throw ApiError.BadRequestError("Invalid report date"); return valueMs;
}

export function resolveReportPeriods(input:ReportPeriodInput,reference=new Date()):{current:Period;previous:Period;preset:ReportPreset}{
	const offsetMs=input.timezoneOffset*60_000,startMinutes=Math.min(1439,Math.max(0,Math.trunc(number(input.businessDayStartMinutes)))),startMs=startMinutes*60_000; const localNow=reference.getTime()+offsetMs;
	const nowDate=new Date(localNow); const calendarToday=Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth(),nowDate.getUTCDate()),todayLocal=calendarToday+(localNow-calendarToday<startMs?-DAY:0),businessDate=new Date(todayLocal);
	let fromLocal=todayLocal+startMs,toLocal=fromLocal+DAY; let preset=input.preset;
	if(preset==="7d"){fromLocal=toLocal-7*DAY;} else if(preset==="30d"){fromLocal=toLocal-30*DAY;}
	else if(preset==="yesterday"){toLocal=todayLocal+startMs;fromLocal=toLocal-DAY;}
	else if(preset==="this_week"){const weekday=(businessDate.getUTCDay()+6)%7;fromLocal=todayLocal-weekday*DAY+startMs;}
	else if(preset==="last_week"){const weekday=(businessDate.getUTCDay()+6)%7;toLocal=todayLocal-weekday*DAY+startMs;fromLocal=toLocal-7*DAY;}
	else if(preset==="this_month"){fromLocal=Date.UTC(businessDate.getUTCFullYear(),businessDate.getUTCMonth(),1)+startMs;}
	else if(preset==="last_month"){toLocal=Date.UTC(businessDate.getUTCFullYear(),businessDate.getUTCMonth(),1)+startMs;fromLocal=Date.UTC(businessDate.getUTCFullYear(),businessDate.getUTCMonth()-1,1)+startMs;}
	else if(preset==="custom"){
		if(!input.dateFrom||!input.dateTo) throw ApiError.BadRequestError("date_from and date_to are required for custom range");
		fromLocal=utcFromLocalDate(input.dateFrom,0)+startMs;toLocal=utcFromLocalDate(input.dateTo,0)+DAY+startMs;
	}
	const days=Math.round((toLocal-fromLocal)/DAY); if(days<1||days>366) throw ApiError.BadRequestError("Report range must be between 1 and 366 days");
	const from=fromLocal-offsetMs,to=toLocal-offsetMs,previousFrom=from-days*DAY;
	const make=(a:number,b:number):Period=>({from:new Date(a).toISOString(),to:new Date(b).toISOString(),date_from:localDate(a-startMs,offsetMs),date_to:localDate(b-DAY-startMs,offsetMs),days:Math.round((b-a)/DAY)});
	return{current:make(from,to),previous:make(previousFrom,from),preset};
}

function comparison(current:number,previous:number){return previous===0?{value:null,available:false}:{value:(current-previous)/Math.abs(previous)*100,available:true};}
function bucketMode(days:number){return days===1?"hour":days<=31?"day":"week";}
function bucketLabel(ms:number,mode:string,offsetMs:number){
	const date=new Date(ms+offsetMs); if(mode==="hour")return `${String(date.getUTCHours()).padStart(2,"0")}:00`;
	if(mode==="week"){const weekday=(date.getUTCDay()+6)%7;return new Date(date.getTime()-weekday*DAY).toISOString().slice(0,10);}
	return date.toISOString().slice(0,10);
}
function fillSeries(rows:any[],period:Period,timezoneOffset:number){
	const offsetMs=timezoneOffset*60_000,mode=bucketMode(period.days),map=new Map(rows.map(item=>[String(item.label),item])); const output:any[]=[];
	const step=mode==="hour"?3_600_000:mode==="day"?DAY:7*DAY;
	for(let ms=new Date(period.from).getTime();ms<new Date(period.to).getTime();ms+=step){const label=bucketLabel(ms,mode,offsetMs);const item=map.get(label)||{};output.push({label,revenue:number(item.revenue),gross_sales:number(item.gross_sales),discount:number(item.discount),vat_amount:number(item.vat_amount),bill_count:number(item.bill_count),known_cost:number(item.known_cost),unknown_cost_revenue:number(item.unknown_cost_revenue),gross_profit:number(item.revenue)-number(item.known_cost)-number(item.unknown_cost_revenue)});}
	return output;
}

// What the stock on the shelf is worth, defined once because it was being
// answered twice with different arithmetic and two different totals.
//
// Quantity comes from inventory_balances, which sales decrement.
// inventory_cost_summaries.qty_base_on_hand only ever counts what was RECEIVED —
// it is never reduced by a sale — so using it made the value climb forever.
//
// Cost comes from the average of what was actually paid on receipts, falling back
// to the cost typed on the product for anything that never came through a
// purchase order. Without the fallback those products drop out of the total.
export function inventoryValueStatement(storeId: string): { sql: string; args: InValue[] } {
	return {
		sql: `SELECT
			COALESCE(SUM(COALESCE(b.on_hand_base, 0) * COALESCE(ics.average_unit_cost_base, p.cost_base, 0)), 0) AS inventory_value,
			COUNT(CASE WHEN COALESCE(b.on_hand_base, 0) > 0 THEN 1 END) AS product_count
			FROM products p
			LEFT JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id
			LEFT JOIN inventory_cost_summaries ics ON ics.store_id = p.store_id AND ics.product_id = p.id
			WHERE p.store_id = ? AND p.active = 1 AND p.deleted_at IS NULL
				AND COALESCE(p.inventory_mode, 'tracked') = 'tracked'`,
		args: [ storeId ],
	};
}

export class ReportInterface{
	private static initialized=false;
	private static async ensureIndexes(){await StoreInterface.ensureColumns();await ensureOrderPaymentColumns();if(this.initialized)return;const db=DbConn.getClient();await db.batch([
		"CREATE INDEX IF NOT EXISTS idx_reports_orders_store_state_paid ON orders(store_id,status,payment_status,paid_at)",
		"CREATE INDEX IF NOT EXISTS idx_reports_orders_store_paid_channel ON orders(store_id,paid_at,service_mode,channel)",
		"CREATE INDEX IF NOT EXISTS idx_reports_items_order_product ON order_items(order_id,product_id,line_status,is_gift)",
	],"write");this.initialized=true;}
	private static async periods(storeId:string,input:ReportPeriodInput){const result=await DbConn.getClient().execute({sql:"SELECT business_day_start_minutes FROM stores WHERE id=? LIMIT 1",args:[storeId]});return resolveReportPeriods({...input,businessDayStartMinutes:number(result.rows[0]?.business_day_start_minutes)});}
	private static clauses(storeId:string,period:Period){return{paid:"o.store_id=? AND o.status='completed' AND o.payment_status='paid' AND o.paid_at>=? AND o.paid_at<?",args:[storeId,period.from,period.to] as InValue[]};}

	static async dashboard(storeId:string,input:ReportPeriodInput):Promise<any>{
		await this.ensureIndexes();const db=DbConn.getClient(),periods=await this.periods(storeId,input),current=this.clauses(storeId,periods.current),previous=this.clauses(storeId,periods.previous);
		const modifier=`${input.timezoneOffset>=0?"+":""}${input.timezoneOffset} minutes`,mode=bucketMode(periods.current.days);
		const seriesExpr=mode==="hour"?`strftime('%H:00',o.paid_at,'${modifier}')`:mode==="day"?`strftime('%Y-%m-%d',o.paid_at,'${modifier}')`:`date(o.paid_at,'${modifier}','-' || ((strftime('%w',o.paid_at,'${modifier}')+6)%7) || ' days')`;
		const itemWhere=`${current.paid} AND COALESCE(oi.line_status,'sent')!='cancelled'`;
		// The per-account breakdown joins a lazily created table; without this the
		// whole dashboard fails on a store that never set up payment accounts.
		await StorePaymentAccountInterface.ensureTable();
		// inventoryValueStatement joins inventory_cost_summaries, which the receipt
		// flow creates lazily: a shop that never received a purchase order would
		// otherwise fail the whole batch.
		await InventoryCostInterface.ensureTables();
		const results=await db.batch([
			{sql:`SELECT COUNT(*) bill_count,COALESCE(SUM(o.total),0) revenue,COALESCE(SUM(o.subtotal),0) gross_sales,COALESCE(SUM(o.discount),0) discount,COALESCE(SUM(o.vat_amount),0) vat_amount,COALESCE(SUM(o.shipping_fee_charged),0) shipping_revenue,COALESCE(SUM(o.shipping_cost),0) shipping_cost,COALESCE(AVG(o.total),0) average_bill,COUNT(CASE WHEN COALESCE(o.discount,0)>0 THEN 1 END) discounted_bill_count FROM orders o WHERE ${current.paid}`,args:current.args},
			{sql:`SELECT COUNT(*) bill_count,COALESCE(SUM(o.total),0) revenue,COALESCE(AVG(o.total),0) average_bill FROM orders o WHERE ${previous.paid}`,args:previous.args},
			{sql:"SELECT COUNT(DISTINCT id) total,COALESCE(SUM(total),0) amount FROM orders WHERE store_id=? AND COALESCE(closed_at,paid_at,created_at)>=? AND COALESCE(closed_at,paid_at,created_at)<? AND (status='cancelled' OR payment_status='refunded')",args:current.args},
			{sql:"SELECT COUNT(DISTINCT id) total,COALESCE(SUM(total),0) amount FROM orders WHERE store_id=? AND COALESCE(closed_at,paid_at,created_at)>=? AND COALESCE(closed_at,paid_at,created_at)<? AND (status='cancelled' OR payment_status='refunded')",args:previous.args},
			{sql:`SELECT ${seriesExpr} label,COALESCE(SUM(o.total),0) revenue,COALESCE(SUM(o.subtotal),0) gross_sales,COALESCE(SUM(o.discount),0) discount,COALESCE(SUM(o.vat_amount),0) vat_amount,COUNT(*) bill_count,COALESCE(SUM((SELECT SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END) FROM order_items oi WHERE oi.order_id=o.id AND COALESCE(oi.line_status,'sent')!='cancelled')),0) known_cost,COALESCE(SUM((SELECT SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END) FROM order_items oi WHERE oi.order_id=o.id AND COALESCE(oi.line_status,'sent')!='cancelled')),0) unknown_cost_revenue FROM orders o WHERE ${current.paid} GROUP BY label ORDER BY label`,args:current.args},
			{sql:`SELECT COALESCE(NULLIF(TRIM(o.payment_method),''),'other') method,COALESCE(SUM(o.total),0) amount,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY method ORDER BY amount DESC`,args:current.args},
			{sql:`SELECT p.id,p.name,p.sku,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id WHERE ${itemWhere} AND COALESCE(oi.is_gift,0)=0 GROUP BY p.id,p.name,p.sku ORDER BY revenue DESC LIMIT 10`,args:current.args},
			{sql:`SELECT oi.product_id,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${previous.paid} AND COALESCE(oi.line_status,'sent')!='cancelled' AND COALESCE(oi.is_gift,0)=0 GROUP BY oi.product_id`,args:previous.args},
			{sql:`SELECT COALESCE(u.id,o.created_by,'deleted') id,COALESCE(NULLIF(u.name,''),NULLIF(u.email,''),'Unknown user') name,COUNT(*) bill_count,COALESCE(SUM(o.total),0) revenue,COALESCE(AVG(o.total),0) average_bill FROM orders o LEFT JOIN users u ON u.id=o.created_by WHERE ${current.paid} GROUP BY 1,2 ORDER BY revenue DESC LIMIT 10`,args:current.args},
			{sql:`SELECT p.id,p.name,p.sku,COALESCE(b.available_base,0) available_base,CASE WHEN COALESCE(p.low_stock_threshold,0)>0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold,0) END threshold FROM products p JOIN stores s ON s.id=p.store_id LEFT JOIN inventory_balances b ON b.store_id=p.store_id AND b.product_id=p.id WHERE p.store_id=? AND p.active=1 AND p.deleted_at IS NULL AND p.inventory_mode='tracked' AND CASE WHEN COALESCE(p.low_stock_threshold,0)>0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold,0) END>0 AND COALESCE(b.available_base,0)<=CASE WHEN COALESCE(p.low_stock_threshold,0)>0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold,0) END ORDER BY available_base,p.name LIMIT 20`,args:[storeId]},
			{sql:`SELECT COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) known_cost,COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0) unknown_cost_revenue,COUNT(DISTINCT CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN o.id END) unknown_cost_bills,COALESCE(SUM(oi.line_total),0) item_revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${itemWhere}`,args:current.args},
			{sql:"SELECT COALESCE(currency,'LAK') currency FROM stores WHERE id=?",args:[storeId]},
			{sql:`SELECT COALESCE(NULLIF(o.service_mode,''),NULLIF(o.channel,''),'other') type,COALESCE(SUM(o.total),0) revenue,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY type ORDER BY revenue DESC`,args:current.args},
			{sql:`SELECT CAST(strftime('%w',o.paid_at,'${modifier}') AS INTEGER) weekday,CAST(strftime('%H',o.paid_at,'${modifier}') AS INTEGER) hour,COALESCE(SUM(o.total),0) revenue,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY weekday,hour`,args:current.args},
			{sql:`SELECT ${seriesExpr} label,COALESCE(NULLIF(o.service_mode,''),NULLIF(o.channel,''),'other') type,COALESCE(SUM(o.total),0) revenue,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY label,type ORDER BY label`,args:current.args},
			{sql:`SELECT p.id,p.name,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id WHERE ${itemWhere} AND COALESCE(oi.is_gift,0)=0 GROUP BY p.id,p.name ORDER BY revenue DESC`,args:current.args},
			{sql:`SELECT COALESCE(pc.id,'uncategorized') id,COALESCE(pc.name,'Uncategorized') name,COALESCE(SUM(CASE WHEN COALESCE(oi.is_gift,0)=0 THEN oi.qty_base ELSE 0 END),0) quantity,COALESCE(SUM(CASE WHEN COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0) revenue,COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) known_cost,COALESCE(SUM(CASE WHEN COALESCE(oi.is_gift,0)=1 AND oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) gift_cost,COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0) unknown_cost_revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id LEFT JOIN product_categories pc ON pc.id=p.category_id WHERE ${itemWhere} GROUP BY pc.id,pc.name HAVING revenue>0 OR gift_cost>0 ORDER BY revenue DESC`,args:current.args},
			{sql:`SELECT op.promotion_id,op.promotion_name,op.promotion_type,COUNT(DISTINCT op.order_id) bill_count,GROUP_CONCAT(DISTINCT op.order_id) order_ids,COALESCE(SUM(op.applications),0) applications,COALESCE(SUM(op.discount_amount),0) discount_amount,COALESCE(SUM(g.gift_quantity),0) gift_quantity,COALESCE(SUM(g.gift_cost),0) gift_cost FROM order_promotions op JOIN orders o ON o.id=op.order_id LEFT JOIN (SELECT order_id,promotion_id,SUM(qty_base) gift_quantity,SUM(CASE WHEN cost_source_at_sale IN ('purchase','manual') THEN cost_base_at_sale*qty_base ELSE 0 END) gift_cost FROM order_items WHERE COALESCE(is_gift,0)=1 AND COALESCE(line_status,'sent')!='cancelled' GROUP BY order_id,promotion_id) g ON g.order_id=op.order_id AND g.promotion_id=op.promotion_id WHERE ${current.paid} GROUP BY op.promotion_id,op.promotion_name,op.promotion_type ORDER BY bill_count DESC,op.promotion_name`,args:current.args},
			{sql:`SELECT COUNT(CASE WHEN p.inventory_mode='tracked' AND COALESCE(b.available_base,0)<=0 THEN 1 END) out_of_stock_count,COUNT(CASE WHEN p.inventory_mode='tracked' AND COALESCE(b.available_base,0)<0 THEN 1 END) negative_stock_count,0 inventory_value,(SELECT COUNT(*) FROM products np WHERE np.store_id=? AND np.active=1 AND np.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM order_items noi JOIN orders no ON no.id=noi.order_id WHERE noi.product_id=np.id AND no.store_id=? AND no.status='completed' AND no.payment_status='paid' AND no.paid_at>=? AND no.paid_at<? AND COALESCE(noi.line_status,'sent')!='cancelled')) no_sales_count FROM products p LEFT JOIN inventory_balances b ON b.store_id=p.store_id AND b.product_id=p.id WHERE p.store_id=? AND p.active=1 AND p.deleted_at IS NULL`,args:[storeId,storeId,periods.current.from,periods.current.to,storeId]},
			// Which bank account actually received each transfer. Orders keep the id
			// even after an account is deactivated, so the join must not filter on
			// is_active: money that already arrived still has to be reported.
			{sql:`SELECT COALESCE(a.id,'unassigned') id,COALESCE(a.display_name,'') display_name,COALESCE(a.bank_name,'') bank_name,COALESCE(a.account_number,'') account_number,COALESCE(a.currency,'') currency,COALESCE(a.is_active,0) is_active,CASE WHEN a.qr_image_url IS NOT NULL AND TRIM(a.qr_image_url)!='' THEN 1 ELSE 0 END has_qr,COALESCE(SUM(o.total),0) amount,COUNT(*) bill_count,MAX(o.paid_at) last_paid_at FROM orders o LEFT JOIN store_payment_accounts a ON a.id=o.payment_account_id WHERE ${current.paid} AND o.payment_method='qr_transfer' GROUP BY 1,2,3,4,5,6 ORDER BY amount DESC`,args:current.args},
			// Stocked goods take their cost from a purchase-order receipt; a menu item
			// only has a cost if someone typed one. Merging the two hides how much of
			// the headline margin is actually backed by a known cost.
			{sql:`SELECT CASE WHEN COALESCE(p.inventory_mode,'tracked')='untracked' THEN 'untracked' ELSE 'tracked' END mode,
				COALESCE(SUM(CASE WHEN COALESCE(oi.is_gift,0)=0 THEN oi.qty_base ELSE 0 END),0) quantity,
				COALESCE(SUM(CASE WHEN COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0) revenue,
				COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) known_cost,
				COALESCE(SUM(CASE WHEN COALESCE(oi.is_gift,0)=1 AND oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) gift_cost,
				COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0) unknown_cost_revenue,
				COUNT(DISTINCT CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.product_id END) unknown_cost_products
				FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id
				WHERE ${itemWhere} GROUP BY mode`,args:current.args},
			// Named, not just counted: "1 product has no cost" leaves the owner to guess
			// which one, and the whole point of the warning is to be actionable.
			// The window count runs before the LIMIT, so the summary can say how many
			// products are missing a cost even though only the top ten are listed.
			{sql:`SELECT p.id,p.name,p.sku,COALESCE(p.inventory_mode,'tracked') inventory_mode,
				COUNT(DISTINCT o.id) bill_count,COALESCE(SUM(oi.line_total),0) revenue,COUNT(*) OVER () total_products
				FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id
				WHERE ${itemWhere} AND oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0
				GROUP BY p.id ORDER BY revenue DESC LIMIT 10`,args:current.args},
			// What the owner has to physically collect. Split by the currency the
			// customer actually paid in, because the converted kip figure is useless
			// for counting a drawer that holds baht notes.
			{sql:`SELECT COALESCE(NULLIF(o.payment_currency,''),'') currency,COALESCE(o.payment_method,'') method,
				COUNT(*) bill_count,COALESCE(SUM(o.total),0) amount_base,
				COALESCE(SUM(o.amount_tendered),0) tendered_base,
				COALESCE(SUM(o.amount_tendered_foreign),0) tendered_foreign,
				COALESCE(SUM(o.change_amount),0) change_base
				FROM orders o WHERE ${current.paid} GROUP BY currency,method`,args:current.args},
			// The same definition the purchasing tab uses, so the two cannot disagree.
			inventoryValueStatement(storeId),
		],"read");
		const currentSummary=row(results[0]),previousSummary=row(results[1]),revenue=number(currentSummary.revenue),grossSales=number(currentSummary.gross_sales),discount=number(currentSummary.discount),bills=number(currentSummary.bill_count),average=number(currentSummary.average_bill),cancelled=number(row(results[2]).total),cancelledAmount=number(row(results[2]).amount),prevCancelled=number(row(results[3]).total);
		const profit=row(results[10]),knownCost=number(profit.known_cost),unknownRevenue=number(profit.unknown_cost_revenue),knownRevenue=Math.max(0,revenue-unknownRevenue),grossProfit=knownRevenue-knownCost;
		// Coverage compares like with like: both sides are item revenue. Dividing by
		// orders.total mixed a pre-discount, pre-VAT figure with a post-discount one.
		const itemRevenue=number(profit.item_revenue),costedItemRevenue=Math.max(0,itemRevenue-unknownRevenue);
		// Gift cost is already inside known_cost; it is exposed separately only so the
		// UI can say what part of the cost was given away.
		const uncostedProducts=(results[21].rows as any[]).map(item=>({id:String(item.id),name:String(item.name||""),sku:String(item.sku||""),inventory_mode:String(item.inventory_mode||"tracked"),bill_count:number(item.bill_count),revenue:number(item.revenue)}));
		const uncostedProductCount=number((results[21].rows as any[])[0]?.total_products);
		const inventoryModeRows=results[20].rows as any[];
		const inventoryModeRevenue=inventoryModeRows.reduce((sum,item)=>sum+number(item.revenue),0);
		const productTypePerformance=[ "tracked", "untracked" ].map(mode=>{
			const item=inventoryModeRows.find(candidate=>String(candidate.mode)===mode);
			const revenue=number(item?.revenue),knownCostForMode=number(item?.known_cost),unknownRevenue=number(item?.unknown_cost_revenue);
			// The same rule the store-wide figure uses: revenue with no cost behind it
			// is excluded from both sides instead of being treated as pure profit.
			const costedRevenue=Math.max(0,revenue-unknownRevenue);
			const grossProfit=costedRevenue-knownCostForMode;
			return {
				mode,
				quantity:number(item?.quantity),
				revenue,
				known_cost:knownCostForMode,
				gift_cost:number(item?.gift_cost),
				gross_profit:grossProfit,
				margin:costedRevenue?grossProfit/costedRevenue*100:0,
				unknown_cost_revenue:unknownRevenue,
				unknown_cost_products:number(item?.unknown_cost_products),
				cost_coverage_percent:revenue?costedRevenue/revenue*100:0,
				revenue_share_percent:inventoryModeRevenue?revenue/inventoryModeRevenue*100:0,
			};
		});
		// Needed by both the per-account rows and the takings split below.
		const baseCurrency=String(row(results[11]).currency||"LAK");
		const accountRows=results[19].rows as any[],accountTotal=accountRows.reduce((sum,item)=>sum+number(item.amount),0);
		const paymentAccounts=accountRows.map(item=>{const amount=number(item.amount),count=number(item.bill_count);return{id:String(item.id),display_name:String(item.display_name||""),bank_name:String(item.bank_name||""),currency:String(item.currency||"")||baseCurrency,account_number:String(item.account_number||""),is_active:number(item.is_active)!==0,has_qr:number(item.has_qr)!==0,amount,bill_count:count,average_bill:count?amount/count:0,percent:accountTotal?amount/accountTotal*100:0,last_paid_at:item.last_paid_at?String(item.last_paid_at):null};});
		const paymentRows=results[5].rows as any[],paymentTotal=paymentRows.reduce((sum,item)=>sum+number(item.amount),0),previousProducts=new Map((results[7].rows as any[]).map(item=>[String(item.product_id),number(item.revenue)]));
		const series=fillSeries(results[4].rows as any[],periods.current,input.timezoneOffset),peak=[...series].sort((a,b)=>b.revenue-a.revenue)[0]||null;
		const lowStock=(results[9].rows as any[]).map(item=>({id:String(item.id),name:String(item.name),sku:String(item.sku||""),available_base:number(item.available_base),threshold:number(item.threshold)}));
		const productMixRows=(results[15].rows as any[]),productRevenueTotal=productMixRows.reduce((sum,item)=>sum+number(item.revenue),0);
		const productMix=productMixRows.slice(0,8).map(item=>({id:String(item.id),name:String(item.name),quantity:number(item.quantity),revenue:number(item.revenue),percent:productRevenueTotal?number(item.revenue)/productRevenueTotal*100:0}));
		if(productMixRows.length>8){const other=productMixRows.slice(8).reduce((sum,item)=>({quantity:sum.quantity+number(item.quantity),revenue:sum.revenue+number(item.revenue)}),{quantity:0,revenue:0});productMix.push({id:"other",name:"Other products",quantity:other.quantity,revenue:other.revenue,percent:productRevenueTotal?other.revenue/productRevenueTotal*100:0});}
		const categoryPerformance=(results[16].rows as any[]).map(item=>{const categoryRevenue=number(item.revenue),unknownCostRevenue=number(item.unknown_cost_revenue),coveredRevenue=Math.max(0,categoryRevenue-unknownCostRevenue),categoryKnownCost=number(item.known_cost),categoryProfit=coveredRevenue-categoryKnownCost;return{id:String(item.id),name:String(item.name),quantity:number(item.quantity),revenue:categoryRevenue,known_cost:categoryKnownCost,gift_cost:number(item.gift_cost),gross_profit:categoryProfit,margin:coveredRevenue?categoryProfit/coveredRevenue*100:0,cost_coverage_percent:categoryRevenue?coveredRevenue/categoryRevenue*100:0};});
		const promotionRows=(results[17].rows as any[]),promotionOrderIds=new Set(promotionRows.flatMap(item=>String(item.order_ids||"").split(",").filter(Boolean)));
		const promotionPerformance=promotionRows.map(item=>({promotion_id:String(item.promotion_id),name:String(item.promotion_name),type:String(item.promotion_type),bill_count:number(item.bill_count),applications:number(item.applications),discount_amount:number(item.discount_amount),gift_quantity:number(item.gift_quantity),gift_cost:number(item.gift_cost)}));
		const promotionSummary=promotionPerformance.reduce((sum,item)=>({promotion_bill_count:promotionOrderIds.size,applications:sum.applications+item.applications,discount_amount:sum.discount_amount+item.discount_amount,gift_quantity:sum.gift_quantity+item.gift_quantity,gift_cost:sum.gift_cost+item.gift_cost}),{promotion_bill_count:promotionOrderIds.size,applications:0,discount_amount:0,gift_quantity:0,gift_cost:0});
		const inventorySignals=row(results[18]);
		// Replaces the placeholder left in the signals query above.
		const inventoryValue=number(row(results[23]).inventory_value);
		// What the owner has to physically go and collect, split the way the money
		// actually sits: notes in the drawer are in the currency the customer used,
		// and the converted kip figure cannot be counted against them.
		const takingsRows=results[22].rows as any[];
		const drawer=new Map<string,{currency:string;amount:number;amount_base:number;bill_count:number}>();
		const takeDrawer=(code:string)=>{const found=drawer.get(code)||{currency:code,amount:0,amount_base:0,bill_count:0};drawer.set(code,found);return found;};
		const byCurrency=new Map<string,{currency:string;bill_count:number;amount_base:number;tendered_base:number;tendered_foreign:number}>();
		let cardAmount=0,cardBillCount=0,bankAmount=0,bankBillCount=0;
		for(const item of takingsRows){
			const code=String(item.currency||"")||baseCurrency,method=String(item.method||"");
			const amountBase=number(item.amount_base),tenderedBase=number(item.tendered_base),tenderedForeign=number(item.tendered_foreign),changeBase=number(item.change_base),billCount=number(item.bill_count);
			const totals=byCurrency.get(code)||{currency:code,bill_count:0,amount_base:0,tendered_base:0,tendered_foreign:0};
			totals.bill_count+=billCount;totals.amount_base+=amountBase;totals.tendered_base+=tenderedBase;totals.tendered_foreign+=tenderedForeign;
			byCurrency.set(code,totals);
			if(method==="cash"){
				if(code===baseCurrency){
					const entry=takeDrawer(code);entry.amount+=tenderedBase-changeBase;entry.amount_base+=tenderedBase-changeBase;entry.bill_count+=billCount;
				}else{
					// Foreign notes come in, but the change went out of the kip float:
					// counting only the notes received would leave the drawer short.
					const foreignEntry=takeDrawer(code);foreignEntry.amount+=tenderedForeign;foreignEntry.amount_base+=tenderedBase;foreignEntry.bill_count+=billCount;
					if(changeBase>0){const baseEntry=takeDrawer(baseCurrency);baseEntry.amount-=changeBase;baseEntry.amount_base-=changeBase;}
				}
			}else if(method==="credit_card"){cardAmount+=amountBase;cardBillCount+=billCount;}
			else{bankAmount+=amountBase;bankBillCount+=billCount;}
		}
		const paymentCurrencies=[...byCurrency.values()].map(item=>({
			currency:item.currency,
			is_base:item.currency===baseCurrency,
			bill_count:item.bill_count,
			amount_base:item.amount_base,
			// Only meaningful for a currency that was actually converted.
			amount_foreign:item.currency===baseCurrency?null:item.tendered_foreign,
			// Weighted by what was taken, not the rate set today: a rate edited
			// mid-period would otherwise disagree with the kip already booked.
			exchange_rate:item.currency===baseCurrency?1:(item.tendered_foreign?item.tendered_base/item.tendered_foreign:0),
			percent:revenue?item.amount_base/revenue*100:0,
		})).sort((a,b)=>Number(b.is_base)-Number(a.is_base)||b.amount_base-a.amount_base);
		const cashTakings={
			base_currency:baseCurrency,
			drawer:[...drawer.values()].sort((a,b)=>Number(b.currency===baseCurrency)-Number(a.currency===baseCurrency)||b.amount_base-a.amount_base),
			drawer_total_base:[...drawer.values()].reduce((sum,item)=>sum+item.amount_base,0),
			bank_amount:bankAmount,bank_bill_count:bankBillCount,
			card_amount:cardAmount,card_bill_count:cardBillCount,
		};
		return{currency:String(row(results[11]).currency||"LAK"),preset:periods.preset,timezone_offset:input.timezoneOffset,period:periods.current,comparison_period:periods.previous,generated_at:new Date().toISOString(),
			summary:{revenue,gross_sales:grossSales,discount,discount_rate_percent:grossSales?discount/grossSales*100:0,discounted_bill_count:number(currentSummary.discounted_bill_count),vat_amount:number(currentSummary.vat_amount),shipping_revenue:number(currentSummary.shipping_revenue),shipping_cost:number(currentSummary.shipping_cost),bill_count:bills,average_bill:average,cancelled_refunded_count:cancelled,cancelled_refunded_amount:cancelledAmount,gross_profit:grossProfit,gross_margin_percent:knownRevenue?grossProfit/knownRevenue*100:0,comparison:{revenue:comparison(revenue,number(previousSummary.revenue)),bill_count:comparison(bills,number(previousSummary.bill_count)),average_bill:comparison(average,number(previousSummary.average_bill)),cancelled_refunded_count:comparison(cancelled,prevCancelled)}},
			profitability:{revenue,known_cost_revenue:knownRevenue,known_cost:knownCost,known_gross_profit:grossProfit,gross_margin_percent:knownRevenue?grossProfit/knownRevenue*100:0,cost_coverage_percent:itemRevenue?costedItemRevenue/itemRevenue*100:0,unknown_cost_revenue:unknownRevenue,unknown_cost_bills:number(profit.unknown_cost_bills),unknown_cost_products:uncostedProductCount,bill_count:bills},sales_series:series,
			uncosted_products:uncostedProducts,
			product_type_performance:productTypePerformance,
			payment_accounts:paymentAccounts,
			payment_currencies:paymentCurrencies,
			cash_takings:cashTakings,
			payment_mix:paymentRows.map(item=>({method:String(item.method),amount:number(item.amount),bill_count:number(item.bill_count),percent:paymentTotal?number(item.amount)/paymentTotal*100:0})),
			top_products:(results[6].rows as any[]).map(item=>{const itemRevenue=number(item.revenue),old=previousProducts.get(String(item.id))||0;return{id:String(item.id),name:String(item.name),sku:String(item.sku||""),quantity:number(item.quantity),revenue:itemRevenue,percent:productRevenueTotal?itemRevenue/productRevenueTotal*100:0,comparison:comparison(itemRevenue,old)};}),product_mix:productMix,category_performance:categoryPerformance,promotion_summary:promotionSummary,promotion_performance:promotionPerformance,
			staff_ranking:(results[8].rows as any[]).map(item=>({id:String(item.id),name:String(item.name),bill_count:number(item.bill_count),revenue:number(item.revenue),average_bill:number(item.average_bill)})),low_stock:lowStock,
			order_type_mix:(results[12].rows as any[]).map(item=>({type:String(item.type),revenue:number(item.revenue),bill_count:number(item.bill_count)})),heatmap:(results[13].rows as any[]).map(item=>({weekday:number(item.weekday),hour:number(item.hour),revenue:number(item.revenue),bill_count:number(item.bill_count)})),order_type_series:(results[14].rows as any[]).map(item=>({label:String(item.label),type:String(item.type),revenue:number(item.revenue),bill_count:number(item.bill_count)})),
			operational_signals:{peak_period:peak?.label||null,peak_revenue:peak?.revenue||0,primary_payment_method:paymentRows[0]?String(paymentRows[0].method):null,primary_payment_percent:paymentRows[0]&&paymentTotal?number(paymentRows[0].amount)/paymentTotal*100:0,restock_sku_count:lowStock.length,out_of_stock_count:number(inventorySignals.out_of_stock_count),negative_stock_count:number(inventorySignals.negative_stock_count),no_sales_count:number(inventorySignals.no_sales_count),inventory_value:inventoryValue}};
	}

	// Purchasing side of the ledger. Reports covered only sales, so a store could
	// see its margin but not what it spent to get there, what it still owes, or
	// what the stock it holds is worth at the cost the receipts actually recorded.
	static async purchasing(storeId:string,input:ReportPeriodInput):Promise<any>{
		await this.ensureIndexes();const db=DbConn.getClient(),periods=await this.periods(storeId,input);
		const received="po.store_id=? AND po.received_at IS NOT NULL AND po.received_at>=? AND po.received_at<?";
		const args=[ storeId,periods.current.from,periods.current.to ] as InValue[],previousArgs=[ storeId,periods.previous.from,periods.previous.to ] as InValue[];
		const goodsExpr="COALESCE(SUM((SELECT SUM(poi.qty_base_received*poi.unit_cost_base) FROM purchase_order_items poi WHERE poi.purchase_order_id=po.id)),0)";
		const spendExpr=`${goodsExpr}+COALESCE(SUM(po.shipping_cost),0)+COALESCE(SUM(po.other_cost),0)`;
		const modifier=`${input.timezoneOffset>=0?"+":""}${input.timezoneOffset} minutes`,mode=bucketMode(periods.current.days);
		const seriesExpr=mode==="hour"?`strftime('%H:00',po.received_at,'${modifier}')`:mode==="day"?`strftime('%Y-%m-%d',po.received_at,'${modifier}')`:`date(po.received_at,'${modifier}','-' || ((strftime('%w',po.received_at,'${modifier}')+6)%7) || ' days')`;
		// Freight is allocated per order, so a product's share has to be worked out
		// against its own order's total quantity before being summed across orders.
		const freightPerUnit="(COALESCE(po.shipping_cost,0)+COALESCE(po.other_cost,0))/NULLIF((SELECT SUM(x.qty_base_ordered) FROM purchase_order_items x WHERE x.purchase_order_id=po.id),0)";
		const results=await db.batch([
			{ sql:`SELECT COUNT(*) po_count,${goodsExpr} goods_cost,COALESCE(SUM(po.shipping_cost),0) shipping_cost,COALESCE(SUM(po.other_cost),0) other_cost,COALESCE(SUM((SELECT SUM(poi.qty_base_received) FROM purchase_order_items poi WHERE poi.purchase_order_id=po.id)),0) qty_received FROM purchase_orders po WHERE ${received}`,args },
			{ sql:`SELECT ${spendExpr} total_spend FROM purchase_orders po WHERE ${received}`,args:previousArgs },
			{ sql:`SELECT COALESCE(NULLIF(TRIM(po.supplier_name),''),'') supplier_name,COUNT(*) po_count,${spendExpr} total_spend FROM purchase_orders po WHERE ${received} GROUP BY COALESCE(NULLIF(TRIM(po.supplier_name),''),'') ORDER BY total_spend DESC LIMIT 20`,args },
			{ sql:"SELECT po.status,COUNT(*) po_count FROM purchase_orders po WHERE po.store_id=? GROUP BY po.status",args:[ storeId ] as InValue[] },
			inventoryValueStatement(storeId),
			{ sql:`SELECT ${seriesExpr} label,${goodsExpr}+COALESCE(SUM(po.shipping_cost),0)+COALESCE(SUM(po.other_cost),0) total_spend,${goodsExpr} goods_cost,COALESCE(SUM(po.shipping_cost),0)+COALESCE(SUM(po.other_cost),0) extra_cost FROM purchase_orders po WHERE ${received} GROUP BY label ORDER BY label`,args },
			{ sql:`SELECT p.id,p.name,p.sku,COALESCE(SUM(poi.qty_base_ordered),0) qty_ordered,COALESCE(SUM(poi.qty_base_received),0) qty_received,COALESCE(SUM(poi.qty_base_ordered-poi.qty_base_received),0) qty_outstanding,COALESCE(SUM(poi.qty_base_received*poi.unit_cost_base),0) goods_cost,COALESCE(SUM(poi.qty_base_received*${freightPerUnit}),0) freight_cost,COUNT(DISTINCT po.id) po_count FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id JOIN products p ON p.id=poi.product_id WHERE ${received} GROUP BY p.id,p.name,p.sku ORDER BY goods_cost DESC LIMIT 50`,args },
			// Money still owed, and stock ordered but not yet in the door. Neither is
			// limited to the period: an unpaid order from last month is still a debt.
			{ sql:"SELECT COUNT(*) po_count,COALESCE(SUM((SELECT SUM(poi.qty_base_ordered*poi.unit_cost_base) FROM purchase_order_items poi WHERE poi.purchase_order_id=po.id)),0)+COALESCE(SUM(po.shipping_cost),0)+COALESCE(SUM(po.other_cost),0) amount FROM purchase_orders po WHERE po.store_id=? AND po.status NOT IN ('cancelled','draft') AND UPPER(COALESCE(po.payment_status,'UNPAID'))!='PAID'",args:[ storeId ] as InValue[] },
			{ sql:"SELECT COUNT(DISTINCT po.id) po_count,COALESCE(SUM((poi.qty_base_ordered-poi.qty_base_received)*poi.unit_cost_base),0) amount,COALESCE(SUM(poi.qty_base_ordered-poi.qty_base_received),0) qty FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id=po.id WHERE po.store_id=? AND po.status NOT IN ('cancelled','draft','received') AND poi.qty_base_ordered>poi.qty_base_received",args:[ storeId ] as InValue[] },
		]);
		const summary=row(results[0]),goodsCost=number(summary.goods_cost),shipping=number(summary.shipping_cost),other=number(summary.other_cost);
		const totalSpend=goodsCost+shipping+other,qtyReceived=number(summary.qty_received),inventory=row(results[4]);
		const payable=row(results[7]),outstanding=row(results[8]);
		const seriesMap=new Map((results[5].rows as any[]).map(item=>[ String(item.label),item ]));
		const offsetMs=input.timezoneOffset*60_000,step=mode==="hour"?3_600_000:mode==="day"?86_400_000:7*86_400_000,series:any[]=[];
		for(let ms=new Date(periods.current.from).getTime();ms<new Date(periods.current.to).getTime();ms+=step){
			const label=bucketLabel(ms,mode,offsetMs),item=seriesMap.get(label)||{};
			series.push({ label,total_spend:number(item.total_spend),goods_cost:number(item.goods_cost),extra_cost:number(item.extra_cost) });
		}
		return{
			period:periods.current,
			summary:{ po_count:number(summary.po_count),goods_cost:goodsCost,shipping_cost:shipping,other_cost:other,total_spend:totalSpend,qty_received:qtyReceived,average_landed_cost:qtyReceived>0?totalSpend/qtyReceived:0,extra_cost_percent:goodsCost>0?(shipping+other)/goodsCost*100:0,comparison:{ total_spend:comparison(totalSpend,number(row(results[1]).total_spend)) } },
			suppliers:(results[2].rows as any[]).map(item=>({ supplier_name:String(item.supplier_name||""),po_count:number(item.po_count),total_spend:number(item.total_spend) })),
			status_mix:(results[3].rows as any[]).map(item=>({ status:String(item.status),po_count:number(item.po_count) })),
			inventory_value:{ value:number(inventory.inventory_value),product_count:number(inventory.product_count) },
			spend_series:series,
			products:(results[6].rows as any[]).map(item=>{
				const goods=number(item.goods_cost),freight=number(item.freight_cost),qty=number(item.qty_received);
				return{ id:String(item.id),name:String(item.name),sku:String(item.sku||""),qty_ordered:number(item.qty_ordered),qty_received:qty,qty_outstanding:number(item.qty_outstanding),goods_cost:goods,freight_cost:freight,total_cost:goods+freight,landed_unit_cost:qty>0?(goods+freight)/qty:0,po_count:number(item.po_count) };
			}),
			payable:{ po_count:number(payable.po_count),amount:number(payable.amount) },
			outstanding:{ po_count:number(outstanding.po_count),amount:number(outstanding.amount),qty:number(outstanding.qty) },
		};
	}

	// Stock is a snapshot: what is on the shelf right now and what it is worth.
	// Only the movement series is period-scoped, and it says so in the UI, because
	// mixing "as of now" and "during the period" in one figure is how a stock
	// report starts disagreeing with the stock page.
	static async stock(storeId:string,input:ReportPeriodInput):Promise<any>{
		await this.ensureIndexes();await InventoryCostInterface.ensureTables();
		const db=DbConn.getClient(),periods=await this.periods(storeId,input);
		const modifier=`${input.timezoneOffset>=0?"+":""}${input.timezoneOffset} minutes`,mode=bucketMode(periods.current.days);
		const seriesExpr=mode==="hour"?`strftime('%H:00',m.created_at,'${modifier}')`:mode==="day"?`strftime('%Y-%m-%d',m.created_at,'${modifier}')`:`date(m.created_at,'${modifier}','-' || ((strftime('%w',m.created_at,'${modifier}')+6)%7) || ' days')`;
		// Cost per unit is resolved the same way everywhere: the average actually
		// paid on receipts, falling back to the cost typed on the product.
		const unitCost="COALESCE(ics.average_unit_cost_base,p.cost_base,0)";
		const trackedFrom=`FROM products p
			LEFT JOIN inventory_balances b ON b.store_id=p.store_id AND b.product_id=p.id
			LEFT JOIN inventory_cost_summaries ics ON ics.store_id=p.store_id AND ics.product_id=p.id
			WHERE p.store_id=? AND p.active=1 AND p.deleted_at IS NULL AND COALESCE(p.inventory_mode,'tracked')='tracked'`;
		const threshold="CASE WHEN COALESCE(p.low_stock_threshold,0)>0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold,0) END";
		const results=await db.batch([
			inventoryValueStatement(storeId),
			{sql:`SELECT
				COUNT(CASE WHEN COALESCE(b.available_base,0)<0 THEN 1 END) negative_count,
				COUNT(CASE WHEN COALESCE(b.available_base,0)=0 THEN 1 END) out_count,
				COUNT(CASE WHEN COALESCE(b.available_base,0)>0 AND ${threshold}>0 AND COALESCE(b.available_base,0)<=${threshold} THEN 1 END) low_count,
				COUNT(CASE WHEN COALESCE(b.available_base,0)>0 AND (${threshold}<=0 OR COALESCE(b.available_base,0)>${threshold}) THEN 1 END) ready_count,
				COUNT(*) tracked_count
				FROM products p JOIN stores s ON s.id=p.store_id
				LEFT JOIN inventory_balances b ON b.store_id=p.store_id AND b.product_id=p.id
				WHERE p.store_id=? AND p.active=1 AND p.deleted_at IS NULL AND COALESCE(p.inventory_mode,'tracked')='tracked'`,args:[storeId]},
			{sql:`SELECT COALESCE(pc.id,'uncategorized') id,COALESCE(pc.name,'Uncategorized') name,
				COUNT(CASE WHEN COALESCE(b.on_hand_base,0)>0 THEN 1 END) product_count,
				COALESCE(SUM(COALESCE(b.on_hand_base,0)),0) quantity,
				COALESCE(SUM(COALESCE(b.on_hand_base,0)*${unitCost}),0) value
				FROM products p
				LEFT JOIN product_categories pc ON pc.id=p.category_id
				LEFT JOIN inventory_balances b ON b.store_id=p.store_id AND b.product_id=p.id
				LEFT JOIN inventory_cost_summaries ics ON ics.store_id=p.store_id AND ics.product_id=p.id
				WHERE p.store_id=? AND p.active=1 AND p.deleted_at IS NULL AND COALESCE(p.inventory_mode,'tracked')='tracked'
				GROUP BY 1,2 HAVING value>0 ORDER BY value DESC`,args:[storeId]},
			{sql:`SELECT p.id,p.name,p.sku,COALESCE(b.on_hand_base,0) on_hand_base,${unitCost} unit_cost,
				COALESCE(b.on_hand_base,0)*${unitCost} value
				${trackedFrom} AND COALESCE(b.on_hand_base,0)>0
				ORDER BY value DESC LIMIT 10`,args:[storeId]},
			{sql:`SELECT p.id,p.name,p.sku,COALESCE(b.available_base,0) available_base,${threshold} threshold
				FROM products p JOIN stores s ON s.id=p.store_id
				LEFT JOIN inventory_balances b ON b.store_id=p.store_id AND b.product_id=p.id
				WHERE p.store_id=? AND p.active=1 AND p.deleted_at IS NULL AND COALESCE(p.inventory_mode,'tracked')='tracked'
					AND ${threshold}>0 AND COALESCE(b.available_base,0)<=${threshold}
				ORDER BY available_base,p.name LIMIT 20`,args:[storeId]},
			// Sales write SALE_OUT; receipts and manual corrections write ADJUSTMENT_*.
			// Split by sign so a correction downwards is not read as a sale.
			{sql:`SELECT ${seriesExpr} label,
				COALESCE(SUM(CASE WHEN m.qty_base>0 THEN m.qty_base ELSE 0 END),0) in_qty,
				COALESCE(SUM(CASE WHEN m.type='SALE_OUT' THEN -m.qty_base ELSE 0 END),0) sold_qty,
				COALESCE(SUM(CASE WHEN m.type!='SALE_OUT' AND m.qty_base<0 THEN -m.qty_base ELSE 0 END),0) out_qty
				FROM inventory_movements m
				WHERE m.store_id=? AND m.created_at>=? AND m.created_at<?
				GROUP BY label ORDER BY label`,args:[storeId,periods.current.from,periods.current.to]},
			{sql:`SELECT
				COALESCE(SUM(CASE WHEN m.qty_base>0 THEN m.qty_base ELSE 0 END),0) in_qty,
				COALESCE(SUM(CASE WHEN m.type='SALE_OUT' THEN -m.qty_base ELSE 0 END),0) sold_qty,
				COALESCE(SUM(CASE WHEN m.type!='SALE_OUT' AND m.qty_base<0 THEN -m.qty_base ELSE 0 END),0) out_qty
				FROM inventory_movements m WHERE m.store_id=? AND m.created_at>=? AND m.created_at<?`,args:[storeId,periods.current.from,periods.current.to]},
			{sql:"SELECT COALESCE(currency,'LAK') currency FROM stores WHERE id=?",args:[storeId]},
		],"read");
		const value=row(results[0]),counts=row(results[1]),movement=row(results[6]);
		const seriesMap=new Map((results[5].rows as any[]).map(item=>[ String(item.label),item ]));
		const offsetMs=input.timezoneOffset*60_000,step=mode==="hour"?3_600_000:mode==="day"?86_400_000:7*86_400_000,series:any[]=[];
		for(let ms=new Date(periods.current.from).getTime();ms<new Date(periods.current.to).getTime();ms+=step){
			const label=bucketLabel(ms,mode,offsetMs),item=seriesMap.get(label)||{};
			series.push({ label,in_qty:number(item.in_qty),sold_qty:number(item.sold_qty),out_qty:number(item.out_qty) });
		}
		return{
			period:periods.current,
			currency:String(row(results[7]).currency||"LAK"),
			summary:{
				inventory_value:number(value.inventory_value),product_count:number(value.product_count),
				tracked_count:number(counts.tracked_count),ready_count:number(counts.ready_count),
				low_count:number(counts.low_count),out_count:number(counts.out_count),negative_count:number(counts.negative_count),
				received_qty:number(movement.in_qty),sold_qty:number(movement.sold_qty),removed_qty:number(movement.out_qty),
			},
			categories:(results[2].rows as any[]).map(item=>({ id:String(item.id),name:String(item.name),product_count:number(item.product_count),quantity:number(item.quantity),value:number(item.value) })),
			top_products:(results[3].rows as any[]).map(item=>({ id:String(item.id),name:String(item.name),sku:String(item.sku||""),on_hand_base:number(item.on_hand_base),unit_cost:number(item.unit_cost),value:number(item.value) })),
			low_stock:(results[4].rows as any[]).map(item=>({ id:String(item.id),name:String(item.name),sku:String(item.sku||""),available_base:number(item.available_base),threshold:number(item.threshold) })),
			movement_series:series,
		};
	}

	static async products(storeId:string,input:ReportPeriodInput,options:{search?:string;categoryId?:string;sort:ProductReportSort;order:"asc"|"desc";page:number;limit:number}){
		await this.ensureIndexes();const db=DbConn.getClient(),periods=await this.periods(storeId,input),current=this.clauses(storeId,periods.current),previous=this.clauses(storeId,periods.previous);const where=[current.paid,"COALESCE(oi.line_status,'sent')!='cancelled'","COALESCE(oi.is_gift,0)=0"],args=[...current.args] as InValue[];
		if(options.search){where.push("(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)");const term=`%${options.search.toLowerCase()}%`;args.push(term,term);}if(options.categoryId){where.push(options.categoryId==="uncategorized"?"p.category_id IS NULL":"p.category_id=?");if(options.categoryId!=="uncategorized")args.push(options.categoryId);}
		const aggregate=`FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id LEFT JOIN product_categories pc ON pc.id=p.category_id WHERE ${where.join(" AND ")}`;
		const sortMap:Record<ProductReportSort,string>={quantity:"quantity",average_price:"average_price",revenue:"revenue",cost:"known_cost",profit:"gross_profit",margin:"margin"},direction=options.order.toUpperCase();
		const baseSelect=`SELECT p.id,p.name,p.sku,COALESCE(pc.name,'Uncategorized') category_name,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue,CASE WHEN SUM(oi.qty_base)>0 THEN SUM(oi.line_total)/SUM(oi.qty_base) ELSE 0 END average_price,COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) known_cost,COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0) unknown_cost_revenue,COALESCE(SUM(oi.line_total),0)-COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0)-COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) gross_profit,CASE WHEN (SUM(oi.line_total)-COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0))>0 THEN (SUM(oi.line_total)-COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0)-COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0))*100.0/(SUM(oi.line_total)-COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0)) ELSE 0 END margin,COUNT(DISTINCT o.id) bill_count`;
		const previousSql=`SELECT oi.product_id,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${previous.paid} AND COALESCE(oi.line_status,'sent')!='cancelled' AND COALESCE(oi.is_gift,0)=0 GROUP BY oi.product_id`;
		// The page only ever holds one slice of the rows, so the totals the summary
		// quotes have to be aggregated over the whole filtered set here.
		const result=await db.batch([{sql:`SELECT COUNT(*) total,COALESCE(SUM(quantity),0) quantity,COALESCE(SUM(revenue),0) revenue FROM (SELECT p.id,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue ${aggregate} GROUP BY p.id)`,args},{sql:`${baseSelect} ${aggregate} GROUP BY p.id,p.name,p.sku,pc.name ORDER BY ${sortMap[options.sort]} ${direction},p.name LIMIT ? OFFSET ?`,args:[...args,options.limit,(options.page-1)*options.limit]},{sql:previousSql,args:previous.args},{sql:"SELECT id,name FROM product_categories WHERE store_id=? ORDER BY sort_order,name",args:[storeId]}],"read");
		const previousMap=new Map((result[2].rows as any[]).map(item=>[String(item.product_id),number(item.revenue)]));return{period:periods.current,items:(result[1].rows as any[]).map(item=>{const revenue=number(item.revenue);return{id:String(item.id),name:String(item.name),sku:String(item.sku||""),category_name:String(item.category_name),quantity:number(item.quantity),average_price:number(item.average_price),revenue,known_cost:number(item.known_cost),unknown_cost_revenue:number(item.unknown_cost_revenue),gross_profit:number(item.gross_profit),margin:number(item.margin),bill_count:number(item.bill_count),comparison:comparison(revenue,previousMap.get(String(item.id))||0)};}),categories:[{id:"uncategorized",name:"Uncategorized"},...(result[3].rows as any[]).map(item=>({id:String(item.id),name:String(item.name)}))],totals:{product_count:number(row(result[0]).total),quantity:number(row(result[0]).quantity),revenue:number(row(result[0]).revenue)},pagination:{page:options.page,limit:options.limit,total:number(row(result[0]).total),pages:Math.max(1,Math.ceil(number(row(result[0]).total)/options.limit))}};
	}

	static async productTrend(storeId:string,productId:string,input:ReportPeriodInput){await this.ensureIndexes();const db=DbConn.getClient(),periods=await this.periods(storeId,input),current=this.clauses(storeId,periods.current),modifier=`${input.timezoneOffset>=0?"+":""}${input.timezoneOffset} minutes`,mode=bucketMode(periods.current.days),expr=mode==="hour"?`strftime('%H:00',o.paid_at,'${modifier}')`:mode==="day"?`strftime('%Y-%m-%d',o.paid_at,'${modifier}')`:`date(o.paid_at,'${modifier}','-' || ((strftime('%w',o.paid_at,'${modifier}')+6)%7) || ' days')`;const result=await db.execute({sql:`SELECT ${expr} label,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${current.paid} AND oi.product_id=? AND COALESCE(oi.line_status,'sent')!='cancelled' AND COALESCE(oi.is_gift,0)=0 GROUP BY label ORDER BY label`,args:[...current.args,productId]});return{period:periods.current,items:result.rows.map((item:any)=>({label:String(item.label),quantity:number(item.quantity),revenue:number(item.revenue)}))};}
}
