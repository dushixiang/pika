import {SnapshotGrid, type SnapshotCardData} from './SnapshotGrid';
import CyberCard from "@/components/CyberCard.tsx";

interface SnapshotSectionProps {
    cards: SnapshotCardData[];
}

export const SnapshotSection = ({cards}: SnapshotSectionProps) => {
    if (cards.length === 0) {
        return null;
    }
    return (
        <CyberCard className="p-6 space-y-4">
            <div>
                <h3 className="text-sm font-bold font-mono uppercase tracking-widest text-gray-600 dark:text-cyan-500">资源快照</h3>
            </div>
            <SnapshotGrid cards={cards}/>
        </CyberCard>
    );
};
