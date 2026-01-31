import { cn } from '@/lib/utils';
import { useState } from 'react';

type Period = 'hour' | 'day' | 'week' | 'month';

export function TimeFilters() {
    const [active, setActive] = useState<Period>('day');

    const filters: { id: Period; label: string }[] = [
        { id: 'hour', label: 'Hora' },
        { id: 'day', label: 'Dia' },
        { id: 'week', label: 'Semana' },
        { id: 'month', label: 'Mês' },
    ];

    return (
        <div className="flex space-x-2 bg-card dark:bg-slate-800 p-1 rounded-lg border border-border dark:border-slate-700 shadow-sm">
            {filters.map((filter) => (
                <button
                    key={filter.id}
                    onClick={() => setActive(filter.id)}
                    className={cn(
                        "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                        active === filter.id
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-muted-foreground dark:text-slate-400 hover:bg-secondary dark:hover:bg-slate-700 hover:text-foreground dark:hover:text-white"
                    )}
                >
                    {filter.label}
                </button>
            ))}
        </div>
    );
}
