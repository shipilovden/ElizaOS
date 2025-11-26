import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { SidebarMenuButton, SidebarMenuItem } from './ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { LogOut, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import TelegramLoginWidget from './telegram-login-widget';

export default function UserAuthStatus() {
  const { telegramUser, isAuthenticated, logout, isLoading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton className="rounded" disabled>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-muted-foreground animate-pulse" />
            <span className="text-xs text-muted-foreground">Loading...</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (isAuthenticated && telegramUser) {
    const displayName = telegramUser.firstName + (telegramUser.lastName ? ` ${telegramUser.lastName}` : '');
    const initials = telegramUser.firstName[0] + (telegramUser.lastName?.[0] || '');

    return (
      <SidebarMenuItem>
        <div className="flex flex-col gap-1 w-full">
          <SidebarMenuButton className="rounded cursor-default hover:bg-sidebar-accent">
            <div className="flex items-center gap-2 w-full">
              <Avatar className="h-6 w-6">
                {telegramUser.photoUrl ? (
                  <AvatarImage src={telegramUser.photoUrl} alt={displayName} />
                ) : null}
                <AvatarFallback className="text-xs bg-sidebar-accent">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className="text-xs font-medium truncate w-full">{displayName}</span>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  <span className="text-xs text-muted-foreground">Logged in</span>
                </div>
              </div>
            </div>
          </SidebarMenuButton>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <LogOut className="h-3 w-3" />
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </Button>
        </div>
      </SidebarMenuItem>
    );
  }

  // Not authenticated - show login widget
  return (
    <SidebarMenuItem>
      <div className="flex flex-col gap-2 w-full">
        <SidebarMenuButton className="rounded cursor-default">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Not logged in</span>
          </div>
        </SidebarMenuButton>
        <TelegramLoginWidget />
      </div>
    </SidebarMenuItem>
  );
}

