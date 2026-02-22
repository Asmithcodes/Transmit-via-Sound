import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { ErrorBoundary } from './components/Layout/ErrorBoundary';
import Home from './pages/Home';
import Transmitter from './pages/Transmitter';
import Receiver from './pages/Receiver';

function App() {
    return (
        <ErrorBoundary>
            <HashRouter>
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<Home />} />
                        <Route path="transmit" element={<Transmitter />} />
                        <Route path="receive" element={<Receiver />} />
                        <Route path="*" element={<Home />} />
                    </Route>
                </Routes>
            </HashRouter>
        </ErrorBoundary>
    );
}

export default App;
