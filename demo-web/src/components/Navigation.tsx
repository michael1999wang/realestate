import clsx from "clsx";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  Home,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Listings Feed", href: "/listings", icon: Building2 },
  { name: "Enrichment Pipeline", href: "/enrichment", icon: TrendingUp },
  { name: "Investment Analysis", href: "/analysis", icon: BarChart3 },
  { name: "Saved Searches", href: "/searches", icon: Search },
  { name: "Live Alerts", href: "/alerts", icon: Bell },
  { name: "System Monitor", href: "/system", icon: Activity },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Zap className="h-8 w-8 text-primary-600" />
              <span className="ml-2 text-xl font-bold text-gray-900">
                RealEstate Platform
              </span>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={clsx(
                      "inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200",
                      isActive
                        ? "border-primary-500 text-gray-900"
                        : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center">
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <div className="pulse-dot"></div>
              <span>Demo Mode</span>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
