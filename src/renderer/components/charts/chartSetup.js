import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

let isRegistered = false;

export function registerChartDefaults() {
  if (isRegistered) return;

  ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
  );

  // Default font and styling for Arabic RTL
  ChartJS.defaults.font.family = 'inherit';
  ChartJS.defaults.color = '#777266';
  ChartJS.defaults.plugins.tooltip.rtl = true;
  ChartJS.defaults.plugins.tooltip.titleFont = { weight: 'bold', family: 'inherit' };
  ChartJS.defaults.plugins.tooltip.bodyFont = { family: 'inherit' };
  ChartJS.defaults.plugins.tooltip.padding = 10;
  ChartJS.defaults.plugins.tooltip.cornerRadius = 8;
  ChartJS.defaults.plugins.tooltip.backgroundColor = '#151515';

  isRegistered = true;
}
