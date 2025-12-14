import {Outlet} from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import PublicFooter from '../components/PublicFooter';

const PublicLayout = () => {
    return (
        <div className="min-h-screen bg-[#05050a] text-slate-200 flex flex-col relative overflow-x-hidden">
            {/* 背景网格效果 */}
            <div
                className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:30px_30px] opacity-20 z-0"></div>
            {/* 顶部发光效果 */}
            <div
                className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none z-0"></div>

            <div className="relative z-10 flex flex-col min-h-screen">
                <PublicHeader/>
                <main className="flex-1">
                    <Outlet/>
                </main>
                <PublicFooter/>
            </div>
        </div>
    );
};

export default PublicLayout;
