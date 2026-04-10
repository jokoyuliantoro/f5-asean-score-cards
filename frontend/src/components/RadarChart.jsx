import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';
import styles from './RadarChart.module.css';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

const FEATURED = ['Singapore', 'Indonesia', 'Myanmar'];

const COLORS = [
  { border: '#4f73ff', bg: 'rgba(79,115,255,0.15)' },
  { border: '#ffc400', bg: 'rgba(255,196,0,0.15)'  },
  { border: '#f94627', bg: 'rgba(249,70,39,0.15)'  },
];

export default function RadarChart({ countries }) {
  const featured = countries.filter(c => FEATURED.includes(c.name));

  const data = {
    labels: ['WAF', 'DDoS', 'Bot Defense', 'API Security'],
    datasets: featured.map((c, i) => ({
      label: c.name,
      data: [c.waf, c.ddos, c.bot, c.api],
      backgroundColor: COLORS[i].bg,
      borderColor: COLORS[i].border,
      borderWidth: 2,
      pointRadius: 4,
      pointBackgroundColor: COLORS[i].border,
    })),
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 25,
          font: { size: 10 },
          color: '#9ea7b8',
          backdropColor: 'transparent',
        },
        grid:        { color: 'rgba(0,0,0,0.08)' },
        angleLines:  { color: 'rgba(0,0,0,0.08)' },
        pointLabels: { font: { size: 11 }, color: '#6c778c' },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: { size: 11 },
          boxWidth: 12,
          padding: 16,
          color: '#6c778c',
        },
      },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}`,
        },
      },
    },
  };

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.panelTitle}>Score Distribution</div>
          <div className={styles.panelSubtitle}>By security category</div>
        </div>
      </div>
      <div className={styles.chartWrap}>
        <Radar data={data} options={options} />
      </div>
    </div>
  );
}
