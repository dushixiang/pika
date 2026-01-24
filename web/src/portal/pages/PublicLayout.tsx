import {Outlet} from 'react-router-dom';
import PublicHeader from '@portal/components/PublicHeader';
import PublicFooter from '@portal/components/PublicFooter';

const PublicLayout = () => {
    return (
        <div className="bg-[#f0f2f5] dark:bg-[#05050a] text-slate-800 dark:text-slate-200 flex flex-col relative overflow-x-hidden transition-colors duration-500">
            {/* 背景网格效果 */}
            <div
                className="fixed inset-0 pointer-events-none z-0 transition-opacity duration-500"
                style={{
                    backgroundImage: 'linear-gradient(to_right,#cbd5e180_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e180_1px,transparent_1px)',
                    backgroundSize: '30px 30px',
                }}
            ></div>
            {/* 暗色模式网格 */}
            <div
                className="fixed inset-0 pointer-events-none z-0 opacity-0 dark:opacity-100 transition-opacity duration-500"
                style={{
                    backgroundImage: 'linear-gradient(to_right,#4f4f4f1a_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f1a_1px,transparent_1px)',
                    backgroundSize: '30px 30px',
                }}
            ></div>
            {/* 顶部发光效果 */}
            <div
                className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-cyan-600/15 blur-[120px] rounded-full pointer-events-none z-0 opacity-40 dark:opacity-100 transition-opacity duration-500"
            ></div>

            <PublicHeader/>
            <div className="relative z-10 flex flex-col min-h-screen pt-[81px]">
                <main className="flex-1">
                    <Outlet/>
                </main>
                <PublicFooter/>
            </div>
        </div>
    );
};

export default PublicLayout;
