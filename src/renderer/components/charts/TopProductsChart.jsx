import React from 'react';
import { Bar } from 'react-chartjs-2';
import { registerChartDefaults } from './chartSetup';

registerChartDefaults();

export function TopProductsChart({ products = [], loading = false }) {
  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#777266]">
        جاري تحميل بيانات المنتجات...
      </div>
    );
  }

  const items = Array.isArray(products) ? products.slice(0, 5) : [];

  if (items.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#777266]">
        لا توجد مبيعات للأصناف في هذه الفترة
      </div>
    );
  }

  const labels = items.map((p) => p.name || 'منتج');
  const quantities = items.map((p) => Number(p.total_sold || p.quantity || p.sales || 0));

  const data = {
    labels,
    datasets: [
      {
        label: 'القطع المباعة',
        data: quantities,
        backgroundColor: [
          '#F4D95B',
          '#F1B6D8',
          '#AFC77A',
          '#B8CCED',
          '#E6DECD',
        ],
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 18,
      },
    ],
  };

  const options = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `الكمية: ${ctx.raw} قطعة`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(230, 222, 205, 0.4)',
        },
        ticks: {
          precision: 0,
          color: '#9E988B',
          font: { size: 11 },
        },
      },
      y: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#24221F',
          font: { size: 12, weight: 'bold' },
        },
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Bar data={data} options={options} />
    </div>
  );
}
