import {Outlet} from 'react-router-dom';
import PublicHeader from '../components/PublicHeader';
import PublicFooter from '../components/PublicFooter';

const globalStyles = `
    /* 防止滚动时出现白色背景 */
    html, body {
        background-color: #05050a;
    }
    
    /* 整体滚动条 */
    ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
    }
    
    /* 滚动条轨道 */
    ::-webkit-scrollbar-track {
        background: #0a0a0f;
        border-radius: 4px;
    }
    
    /* 滚动条滑块 */
    ::-webkit-scrollbar-thumb {
        background: #1e1e28;
        border-radius: 4px;
        border: 1px solid #2a2a35;
    }
    
    /* 滚动条滑块悬停 */
    ::-webkit-scrollbar-thumb:hover {
        background: #2a2a38;
    }
    
    /* 滚动条角落 */
    ::-webkit-scrollbar-corner {
        background: #05050a;
    }
    
    /* Firefox 滚动条 */
    * {
        scrollbar-width: thin;
        scrollbar-color: #1e1e28 #0a0a0f;
    }
`;

const PublicLayout = () => {
    return (
        <div className="min-h-screen bg-[#05050a] text-slate-200 flex flex-col relative overflow-x-hidden">
            <style>{globalStyles}</style>
            {/* 背景网格效果 */}
            <div
                className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:30px_30px] opacity-20 z-0"></div>
            {/* 顶部发光效果 */}
            <div
                className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[300px] bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none z-0"></div>

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
