<script setup lang="ts">
import type { EChartsCoreOption } from "echarts/core";

const props=withDefaults(defineProps<{option:EChartsCoreOption;height?:string;empty?:boolean}>(),{height:"320px",empty:false});
const target=ref<HTMLElement|null>(null);let chart:any;let observer:ResizeObserver|undefined;
async function render(){if(!target.value||props.empty)return;const echarts=await import("echarts/core");const [{LineChart,BarChart,PieChart,HeatmapChart},{GridComponent,TooltipComponent,LegendComponent,DatasetComponent,DataZoomComponent,VisualMapComponent},{CanvasRenderer}]=await Promise.all([import("echarts/charts"),import("echarts/components"),import("echarts/renderers")]);echarts.use([LineChart,BarChart,PieChart,HeatmapChart,GridComponent,TooltipComponent,LegendComponent,DatasetComponent,DataZoomComponent,VisualMapComponent,CanvasRenderer]);chart ||= echarts.init(target.value);chart.setOption(props.option,true);}
watch(()=>props.option,()=>void nextTick(render),{deep:true});watch(()=>props.empty,value=>{if(!value)void nextTick(render);});
onMounted(()=>{void render();observer=new ResizeObserver(()=>chart?.resize());if(target.value)observer.observe(target.value);});
onBeforeUnmount(()=>{observer?.disconnect();chart?.dispose();chart=undefined;});
</script>
<template><div class="relative w-full" :style="{height}"><div v-if="empty" class="absolute inset-0 grid place-items-center rounded-md bg-stone-50 text-sm text-stone-500"><slot name="empty">ຍັງບໍ່ມີຂໍ້ມູນ</slot></div><div ref="target" class="h-full w-full" /></div></template>
