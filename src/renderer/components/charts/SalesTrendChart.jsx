import React from 'react';
import { Line } from 'react-chartjs-2';
import { registerChartDefaults } from './chartSetup';

registerChartDefaults();

export function SalesTrendChart({ trend = [], loading = false }) {
  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#777266]">
        جاري تحميل بيانات الرسم البياني...
      </div>
    );
  }

  if (!trend || trend.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#777266]">
        لا توجد بيانات حركة مبيعات للفترة المحددة
      </div>
    );
  }

  const labels = trend.map((t) => (t.day ? t.day.trim() : ''));
  const amounts = trend.map((t) => Number(t.total || 0));

  const data = {
    labels,
    datasets: [
      {
        label: 'صافي المبيعات (ج.م)',
        data: amounts,
        fill: true,
        borderColor: '#24221F',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 240);
          gradient.addColorStop(0, 'rgba(244, 217, 91, 0.45)');
          gradient.addColorStop(1, 'rgba(244, 217, 91, 0.0)');
          return gradient;
        },
        borderWidth: 2.5,
        tension: 0.35,
        pointBackgroundColor: '#F4D95B',
        pointBorderColor: '#24221F',
        pointBorderWidth: 2,
        pointRadius: 3.5,
        pointHoverRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `المبيعات: ${Number(ctx.raw || 0).toLocaleString()} ج.م`,
        },
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#9E988B',
          font: { size: 11 },
        },
      },
      y: {
        grid: {
          color: 'rgba(230, 222, 205, 0.4)',
        },
        ticks: {
          color: '#9E988B',
          font: { size: 11 },
          callback: (value) => `${value.toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div className="h-64 w-full">
      <Line data={data} options={options} />
    </div>
  );
}
