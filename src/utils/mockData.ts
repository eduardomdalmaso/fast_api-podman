export interface ReportItem {
    id: string;
    timestamp: string;
    platform: string;
    operation: 'Embark' | 'Disembark';
    quantity: number;
    zone?: string;
}

export interface ChartDataItem {
    time: string;
    carregados: number;
    descarregados: number;
}

export const generateMockReports = (count: number = 50): ReportItem[] => {
    const data: ReportItem[] = [];
    const operations: ('Embark' | 'Disembark')[] = ['Embark', 'Disembark'];
    // users removed from report items

    for (let i = 1; i <= count; i++) {
        data.push({
            id: i.toString(),
            timestamp: `2024-03-${String(Math.floor(Math.random() * 30) + 1).padStart(2, '0')} ${String(Math.floor(Math.random() * 23)).padStart(2, '0')}:${String(Math.floor(Math.random() * 59)).padStart(2, '0')}`,
            platform: `Platform ${Math.floor(Math.random() * 4) + 1}`,
            operation: operations[Math.floor(Math.random() * operations.length)],
            quantity: Math.floor(Math.random() * 50) + 1,
            zone: ['A','B','C'][Math.floor(Math.random() * 3)]
        });
    }
    return data.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
};

export const generateMockChartData = (timeFilter: string, platformFilter: string): ChartDataItem[] => {
    const multiplier = platformFilter === 'all' ? 1 : 0.5 + (parseInt(platformFilter) * 0.1);

    if (timeFilter === 'day') {
        return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => ({
            time: day,
            carregados: Math.floor((Math.random() * 5000 + 1000) * multiplier),
            descarregados: Math.floor((Math.random() * 5000 + 1000) * multiplier)
        }));
    }
    if (timeFilter === 'week') {
        return ['Week 1', 'Week 2', 'Week 3', 'Week 4'].map(week => ({
            time: week,
            carregados: Math.floor((Math.random() * 20000 + 5000) * multiplier),
            descarregados: Math.floor((Math.random() * 20000 + 5000) * multiplier)
        }));
    }
    if (timeFilter === 'month') {
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => ({
            time: month,
            carregados: Math.floor((Math.random() * 50000 + 10000) * multiplier),
            descarregados: Math.floor((Math.random() * 50000 + 10000) * multiplier)
        }));
    }

    // Default 'hour'
    return Array.from({ length: 13 }, (_, i) => {
        const hour = i + 6;
        const time = `${String(hour).padStart(2, '0')}:00`;
        return {
            time,
            carregados: Math.floor((Math.random() * 500 + 800) * multiplier),
            descarregados: Math.floor((Math.random() * 500 + 800) * multiplier)
        };
    });
};
