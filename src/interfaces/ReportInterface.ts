import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { ApiError } from "@middlewares/ApiError";

export type ReportPreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "custom" | "7d" | "30d";
export type ProductReportSort = "quantity" | "average_price" | "revenue" | "cost" | "profit" | "margin";
type Period = { from: string; to: string; date_from: string; date_to: string; days: number };
export type ReportPeriodInput = { preset: ReportPreset; dateFrom?: string; dateTo?: string; timezoneOffset: number };

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
	const offsetMs=input.timezoneOffset*60_000; const localNow=reference.getTime()+offsetMs;
	const nowDate=new Date(localNow); const todayLocal=Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth(),nowDate.getUTCDate());
	let fromLocal=todayLocal,toLocal=todayLocal+DAY; let preset=input.preset;
	if(preset==="7d"){fromLocal=toLocal-7*DAY;} else if(preset==="30d"){fromLocal=toLocal-30*DAY;}
	else if(preset==="yesterday"){toLocal=todayLocal;fromLocal=toLocal-DAY;}
	else if(preset==="this_week"){const weekday=(nowDate.getUTCDay()+6)%7;fromLocal=todayLocal-weekday*DAY;}
	else if(preset==="last_week"){const weekday=(nowDate.getUTCDay()+6)%7;toLocal=todayLocal-weekday*DAY;fromLocal=toLocal-7*DAY;}
	else if(preset==="this_month"){fromLocal=Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth(),1);}
	else if(preset==="last_month"){toLocal=Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth(),1);fromLocal=Date.UTC(nowDate.getUTCFullYear(),nowDate.getUTCMonth()-1,1);}
	else if(preset==="custom"){
		if(!input.dateFrom||!input.dateTo) throw ApiError.BadRequestError("date_from and date_to are required for custom range");
		fromLocal=utcFromLocalDate(input.dateFrom,0);toLocal=utcFromLocalDate(input.dateTo,0)+DAY;
	}
	const days=Math.round((toLocal-fromLocal)/DAY); if(days<1||days>366) throw ApiError.BadRequestError("Report range must be between 1 and 366 days");
	const from=fromLocal-offsetMs,to=toLocal-offsetMs,previousFrom=from-days*DAY;
	const make=(a:number,b:number):Period=>({from:new Date(a).toISOString(),to:new Date(b).toISOString(),date_from:localDate(a,offsetMs),date_to:localDate(b-DAY,offsetMs),days:Math.round((b-a)/DAY)});
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
	for(let ms=new Date(period.from).getTime();ms<new Date(period.to).getTime();ms+=step){const label=bucketLabel(ms,mode,offsetMs);const item=map.get(label)||{};output.push({label,revenue:number(item.revenue),bill_count:number(item.bill_count),known_cost:number(item.known_cost),unknown_cost_revenue:number(item.unknown_cost_revenue),gross_profit:number(item.revenue)-number(item.known_cost)-number(item.unknown_cost_revenue)});}
	return output;
}

export class ReportInterface{
	private static initialized=false;
	private static async ensureIndexes(){if(this.initialized)return;const db=DbConn.getClient();await db.batch([
		"CREATE INDEX IF NOT EXISTS idx_reports_orders_store_state_paid ON orders(store_id,status,payment_status,paid_at)",
		"CREATE INDEX IF NOT EXISTS idx_reports_orders_store_paid_channel ON orders(store_id,paid_at,service_mode,channel)",
		"CREATE INDEX IF NOT EXISTS idx_reports_items_order_product ON order_items(order_id,product_id,line_status,is_gift)",
	],"write");this.initialized=true;}
	private static clauses(storeId:string,period:Period){return{paid:"o.store_id=? AND o.status='completed' AND o.payment_status='paid' AND o.paid_at>=? AND o.paid_at<?",args:[storeId,period.from,period.to] as InValue[]};}

	static async dashboard(storeId:string,input:ReportPeriodInput):Promise<any>{
		await this.ensureIndexes();const db=DbConn.getClient(),periods=resolveReportPeriods(input),current=this.clauses(storeId,periods.current),previous=this.clauses(storeId,periods.previous);
		const modifier=`${input.timezoneOffset>=0?"+":""}${input.timezoneOffset} minutes`,mode=bucketMode(periods.current.days);
		const seriesExpr=mode==="hour"?`strftime('%H:00',o.paid_at,'${modifier}')`:mode==="day"?`strftime('%Y-%m-%d',o.paid_at,'${modifier}')`:`date(o.paid_at,'${modifier}','-' || ((strftime('%w',o.paid_at,'${modifier}')+6)%7) || ' days')`;
		const itemWhere=`${current.paid} AND COALESCE(oi.line_status,'sent')!='cancelled'`;
		const results=await db.batch([
			{sql:`SELECT COUNT(*) bill_count,COALESCE(SUM(o.total),0) revenue,COALESCE(AVG(o.total),0) average_bill FROM orders o WHERE ${current.paid}`,args:current.args},
			{sql:`SELECT COUNT(*) bill_count,COALESCE(SUM(o.total),0) revenue,COALESCE(AVG(o.total),0) average_bill FROM orders o WHERE ${previous.paid}`,args:previous.args},
			{sql:"SELECT COUNT(DISTINCT id) total FROM orders WHERE store_id=? AND COALESCE(closed_at,paid_at,created_at)>=? AND COALESCE(closed_at,paid_at,created_at)<? AND (status='cancelled' OR payment_status='refunded')",args:current.args},
			{sql:"SELECT COUNT(DISTINCT id) total FROM orders WHERE store_id=? AND COALESCE(closed_at,paid_at,created_at)>=? AND COALESCE(closed_at,paid_at,created_at)<? AND (status='cancelled' OR payment_status='refunded')",args:previous.args},
			{sql:`SELECT ${seriesExpr} label,COALESCE(SUM(o.total),0) revenue,COUNT(*) bill_count,COALESCE(SUM((SELECT SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END) FROM order_items oi WHERE oi.order_id=o.id AND COALESCE(oi.line_status,'sent')!='cancelled')),0) known_cost,COALESCE(SUM((SELECT SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END) FROM order_items oi WHERE oi.order_id=o.id AND COALESCE(oi.line_status,'sent')!='cancelled')),0) unknown_cost_revenue FROM orders o WHERE ${current.paid} GROUP BY label ORDER BY label`,args:current.args},
			{sql:`SELECT COALESCE(NULLIF(TRIM(o.payment_method),''),'other') method,COALESCE(SUM(o.total),0) amount,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY method ORDER BY amount DESC`,args:current.args},
			{sql:`SELECT p.id,p.name,p.sku,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id WHERE ${itemWhere} AND COALESCE(oi.is_gift,0)=0 GROUP BY p.id,p.name,p.sku ORDER BY revenue DESC LIMIT 10`,args:current.args},
			{sql:`SELECT oi.product_id,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${previous.paid} AND COALESCE(oi.line_status,'sent')!='cancelled' AND COALESCE(oi.is_gift,0)=0 GROUP BY oi.product_id`,args:previous.args},
			{sql:`SELECT COALESCE(u.id,o.created_by,'deleted') id,COALESCE(NULLIF(u.name,''),NULLIF(u.email,''),'Unknown user') name,COUNT(*) bill_count,COALESCE(SUM(o.total),0) revenue,COALESCE(AVG(o.total),0) average_bill FROM orders o LEFT JOIN users u ON u.id=o.created_by WHERE ${current.paid} GROUP BY 1,2 ORDER BY revenue DESC LIMIT 10`,args:current.args},
			{sql:`SELECT p.id,p.name,p.sku,COALESCE(b.available_base,0) available_base,CASE WHEN COALESCE(p.low_stock_threshold,0)>0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold,0) END threshold FROM products p JOIN stores s ON s.id=p.store_id LEFT JOIN inventory_balances b ON b.store_id=p.store_id AND b.product_id=p.id WHERE p.store_id=? AND p.active=1 AND p.deleted_at IS NULL AND p.inventory_mode='tracked' AND CASE WHEN COALESCE(p.low_stock_threshold,0)>0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold,0) END>0 AND COALESCE(b.available_base,0)<=CASE WHEN COALESCE(p.low_stock_threshold,0)>0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold,0) END ORDER BY available_base,p.name LIMIT 20`,args:[storeId]},
			{sql:`SELECT COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) known_cost,COALESCE(SUM(CASE WHEN oi.cost_source_at_sale='unknown' AND COALESCE(oi.is_gift,0)=0 THEN oi.line_total ELSE 0 END),0) unknown_cost_revenue,COUNT(DISTINCT CASE WHEN oi.cost_source_at_sale='unknown' THEN o.id END) unknown_cost_bills FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${itemWhere}`,args:current.args},
			{sql:"SELECT COALESCE(currency,'LAK') currency FROM stores WHERE id=?",args:[storeId]},
			{sql:`SELECT COALESCE(NULLIF(o.service_mode,''),NULLIF(o.channel,''),'other') type,COALESCE(SUM(o.total),0) revenue,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY type ORDER BY revenue DESC`,args:current.args},
			{sql:`SELECT CAST(strftime('%w',o.paid_at,'${modifier}') AS INTEGER) weekday,CAST(strftime('%H',o.paid_at,'${modifier}') AS INTEGER) hour,COALESCE(SUM(o.total),0) revenue,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY weekday,hour`,args:current.args},
			{sql:`SELECT ${seriesExpr} label,COALESCE(NULLIF(o.service_mode,''),NULLIF(o.channel,''),'other') type,COALESCE(SUM(o.total),0) revenue,COUNT(*) bill_count FROM orders o WHERE ${current.paid} GROUP BY label,type ORDER BY label`,args:current.args},
		],"read");
		const currentSummary=row(results[0]),previousSummary=row(results[1]),revenue=number(currentSummary.revenue),bills=number(currentSummary.bill_count),average=number(currentSummary.average_bill),cancelled=number(row(results[2]).total),prevCancelled=number(row(results[3]).total);
		const profit=row(results[10]),knownCost=number(profit.known_cost),unknownRevenue=number(profit.unknown_cost_revenue),knownRevenue=Math.max(0,revenue-unknownRevenue),grossProfit=knownRevenue-knownCost;
		const paymentRows=results[5].rows as any[],paymentTotal=paymentRows.reduce((sum,item)=>sum+number(item.amount),0),previousProducts=new Map((results[7].rows as any[]).map(item=>[String(item.product_id),number(item.revenue)]));
		const series=fillSeries(results[4].rows as any[],periods.current,input.timezoneOffset),peak=[...series].sort((a,b)=>b.revenue-a.revenue)[0]||null;
		const lowStock=(results[9].rows as any[]).map(item=>({id:String(item.id),name:String(item.name),sku:String(item.sku||""),available_base:number(item.available_base),threshold:number(item.threshold)}));
		return{currency:String(row(results[11]).currency||"LAK"),preset:periods.preset,timezone_offset:input.timezoneOffset,period:periods.current,comparison_period:periods.previous,generated_at:new Date().toISOString(),
			summary:{revenue,bill_count:bills,average_bill:average,cancelled_refunded_count:cancelled,gross_profit:grossProfit,gross_margin_percent:knownRevenue?grossProfit/knownRevenue*100:0,comparison:{revenue:comparison(revenue,number(previousSummary.revenue)),bill_count:comparison(bills,number(previousSummary.bill_count)),average_bill:comparison(average,number(previousSummary.average_bill)),cancelled_refunded_count:comparison(cancelled,prevCancelled)}},
			profitability:{revenue,known_cost_revenue:knownRevenue,known_cost:knownCost,known_gross_profit:grossProfit,gross_margin_percent:knownRevenue?grossProfit/knownRevenue*100:0,unknown_cost_revenue:unknownRevenue,unknown_cost_bills:number(profit.unknown_cost_bills),bill_count:bills},sales_series:series,
			payment_mix:paymentRows.map(item=>({method:String(item.method),amount:number(item.amount),bill_count:number(item.bill_count),percent:paymentTotal?number(item.amount)/paymentTotal*100:0})),
			top_products:(results[6].rows as any[]).map(item=>{const itemRevenue=number(item.revenue),old=previousProducts.get(String(item.id))||0;return{id:String(item.id),name:String(item.name),sku:String(item.sku||""),quantity:number(item.quantity),revenue:itemRevenue,comparison:comparison(itemRevenue,old)};}),
			staff_ranking:(results[8].rows as any[]).map(item=>({id:String(item.id),name:String(item.name),bill_count:number(item.bill_count),revenue:number(item.revenue),average_bill:number(item.average_bill)})),low_stock:lowStock,
			order_type_mix:(results[12].rows as any[]).map(item=>({type:String(item.type),revenue:number(item.revenue),bill_count:number(item.bill_count)})),heatmap:(results[13].rows as any[]).map(item=>({weekday:number(item.weekday),hour:number(item.hour),revenue:number(item.revenue),bill_count:number(item.bill_count)})),order_type_series:(results[14].rows as any[]).map(item=>({label:String(item.label),type:String(item.type),revenue:number(item.revenue),bill_count:number(item.bill_count)})),
			operational_signals:{peak_period:peak?.label||null,peak_revenue:peak?.revenue||0,primary_payment_method:paymentRows[0]?String(paymentRows[0].method):null,primary_payment_percent:paymentRows[0]&&paymentTotal?number(paymentRows[0].amount)/paymentTotal*100:0,restock_sku_count:lowStock.length}};
	}

	static async products(storeId:string,input:ReportPeriodInput,options:{search?:string;categoryId?:string;sort:ProductReportSort;order:"asc"|"desc";page:number;limit:number}){
		await this.ensureIndexes();const db=DbConn.getClient(),periods=resolveReportPeriods(input),current=this.clauses(storeId,periods.current),previous=this.clauses(storeId,periods.previous);const where=[current.paid,"COALESCE(oi.line_status,'sent')!='cancelled'","COALESCE(oi.is_gift,0)=0"],args=[...current.args] as InValue[];
		if(options.search){where.push("(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)");const term=`%${options.search.toLowerCase()}%`;args.push(term,term);}if(options.categoryId){where.push(options.categoryId==="uncategorized"?"p.category_id IS NULL":"p.category_id=?");if(options.categoryId!=="uncategorized")args.push(options.categoryId);}
		const aggregate=`FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id LEFT JOIN product_categories pc ON pc.id=p.category_id WHERE ${where.join(" AND ")}`;
		const sortMap:Record<ProductReportSort,string>={quantity:"quantity",average_price:"average_price",revenue:"revenue",cost:"known_cost",profit:"gross_profit",margin:"margin"},direction=options.order.toUpperCase();
		const baseSelect=`SELECT p.id,p.name,p.sku,COALESCE(pc.name,'Uncategorized') category_name,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue,CASE WHEN SUM(oi.qty_base)>0 THEN SUM(oi.line_total)/SUM(oi.qty_base) ELSE 0 END average_price,COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) known_cost,COALESCE(SUM(oi.line_total),0)-COALESCE(SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END),0) gross_profit,CASE WHEN SUM(oi.line_total)>0 THEN (SUM(oi.line_total)-SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase','manual') THEN oi.cost_base_at_sale*oi.qty_base ELSE 0 END))*100.0/SUM(oi.line_total) ELSE 0 END margin,COUNT(DISTINCT o.id) bill_count`;
		const previousSql=`SELECT oi.product_id,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${previous.paid} AND COALESCE(oi.line_status,'sent')!='cancelled' AND COALESCE(oi.is_gift,0)=0 GROUP BY oi.product_id`;
		const result=await db.batch([{sql:`SELECT COUNT(*) total FROM (SELECT p.id ${aggregate} GROUP BY p.id)`,args},{sql:`${baseSelect} ${aggregate} GROUP BY p.id,p.name,p.sku,pc.name ORDER BY ${sortMap[options.sort]} ${direction},p.name LIMIT ? OFFSET ?`,args:[...args,options.limit,(options.page-1)*options.limit]},{sql:previousSql,args:previous.args},{sql:"SELECT id,name FROM product_categories WHERE store_id=? ORDER BY sort_order,name",args:[storeId]}],"read");
		const previousMap=new Map((result[2].rows as any[]).map(item=>[String(item.product_id),number(item.revenue)]));return{period:periods.current,items:(result[1].rows as any[]).map(item=>{const revenue=number(item.revenue);return{id:String(item.id),name:String(item.name),sku:String(item.sku||""),category_name:String(item.category_name),quantity:number(item.quantity),average_price:number(item.average_price),revenue,known_cost:number(item.known_cost),gross_profit:number(item.gross_profit),margin:number(item.margin),bill_count:number(item.bill_count),comparison:comparison(revenue,previousMap.get(String(item.id))||0)};}),categories:[{id:"uncategorized",name:"Uncategorized"},...(result[3].rows as any[]).map(item=>({id:String(item.id),name:String(item.name)}))],pagination:{page:options.page,limit:options.limit,total:number(row(result[0]).total),pages:Math.max(1,Math.ceil(number(row(result[0]).total)/options.limit))}};
	}

	static async productTrend(storeId:string,productId:string,input:ReportPeriodInput){const db=DbConn.getClient(),periods=resolveReportPeriods(input),current=this.clauses(storeId,periods.current),modifier=`${input.timezoneOffset>=0?"+":""}${input.timezoneOffset} minutes`,mode=bucketMode(periods.current.days),expr=mode==="hour"?`strftime('%H:00',o.paid_at,'${modifier}')`:mode==="day"?`strftime('%Y-%m-%d',o.paid_at,'${modifier}')`:`date(o.paid_at,'${modifier}','-' || ((strftime('%w',o.paid_at,'${modifier}')+6)%7) || ' days')`;const result=await db.execute({sql:`SELECT ${expr} label,COALESCE(SUM(oi.qty_base),0) quantity,COALESCE(SUM(oi.line_total),0) revenue FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE ${current.paid} AND oi.product_id=? AND COALESCE(oi.line_status,'sent')!='cancelled' AND COALESCE(oi.is_gift,0)=0 GROUP BY label ORDER BY label`,args:[...current.args,productId]});return{period:periods.current,items:result.rows.map((item:any)=>({label:String(item.label),quantity:number(item.quantity),revenue:number(item.revenue)}))};}
}
