import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
} from "react-router-dom";
import { Navigation } from "./components/Navigation";
import { Dashboard } from "./pages/Dashboard";
import { EnrichmentPipeline } from "./pages/EnrichmentPipeline";
import { InvestmentAnalysis } from "./pages/InvestmentAnalysis";
import { ListingsFeed } from "./pages/ListingsFeed";
import { LiveAlerts } from "./pages/LiveAlerts";
import { SavedSearches } from "./pages/SavedSearches";
import { SystemMonitor } from "./pages/SystemMonitor";

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/listings" element={<ListingsFeed />} />
            <Route path="/enrichment" element={<EnrichmentPipeline />} />
            <Route path="/analysis" element={<InvestmentAnalysis />} />
            <Route path="/searches" element={<SavedSearches />} />
            <Route path="/alerts" element={<LiveAlerts />} />
            <Route path="/system" element={<SystemMonitor />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
