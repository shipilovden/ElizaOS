import clientLogger from '@/lib/logger';

export interface TelegramWidgetConfig {
  botUsername: string;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  onReady?: () => void;
}

/**
 * Loads Telegram Widget script if not already loaded
 */
export function loadTelegramWidgetScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="telegram-widget.js"]');
    
    if (existingScript) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    
    script.onload = () => {
      clientLogger.info('Telegram widget script loaded');
      resolve();
    };
    
    script.onerror = () => {
      clientLogger.error('Failed to load Telegram widget script');
      reject(new Error('Failed to load Telegram authentication script'));
    };
    
    document.body.appendChild(script);
  });
}

/**
 * Creates Telegram login widget in the specified container
 */
export function createTelegramWidget(
  container: HTMLElement,
  config: TelegramWidgetConfig
): void {
  // Clear container
  container.innerHTML = '';

  // Check if widget already exists
  if (container.querySelector('script[data-telegram-login]')) {
    clientLogger.info('Telegram widget already exists in container');
    return;
  }

  clientLogger.info('Creating Telegram widget with onauth callback', { 
    botUsername: config.botUsername 
  });

  // Create script tag exactly as per Telegram documentation
  const widgetScript = document.createElement('script');
  widgetScript.async = true;
  widgetScript.src = 'https://telegram.org/js/telegram-widget.js?22';

  // Set attributes as per Telegram docs - use onauth callback
  widgetScript.setAttribute('data-telegram-login', config.botUsername);
  widgetScript.setAttribute('data-size', 'large');
  widgetScript.setAttribute('data-onauth', 'onTelegramAuth(user)');
  widgetScript.setAttribute('data-request-access', 'write');

  widgetScript.onload = () => {
    clientLogger.info('Telegram widget script loaded successfully');
    config.onLoad?.();
    
    // Check if widget was created after a delay
    const checkWidget = setInterval(() => {
      const iframe = container.querySelector('iframe');
      const link = container.querySelector('a');
      const button = container.querySelector('button');

      if (iframe || link || button) {
        clientLogger.info('Telegram widget rendered successfully', {
          hasIframe: !!iframe,
          hasLink: !!link,
          hasButton: !!button
        });
        config.onReady?.();
        clearInterval(checkWidget);
      }
    }, 200);

    // Timeout after 3 seconds
    setTimeout(() => {
      clearInterval(checkWidget);
      if (!container.querySelector('iframe') && !container.querySelector('a')) {
        clientLogger.warn('Telegram widget did not render');
        config.onError?.(new Error('Widget did not render'));
      }
    }, 3000);
  };

  widgetScript.onerror = (error) => {
    clientLogger.error('Failed to load Telegram widget script', error);
    config.onError?.(new Error('Failed to load Telegram authentication script'));
  };

  container.appendChild(widgetScript);

  clientLogger.info('Telegram widget script appended to container', {
    containerId: container.id,
    scriptSrc: widgetScript.src,
    attributes: {
      'data-telegram-login': config.botUsername,
      'data-size': 'large',
      'data-onauth': 'onTelegramAuth(user)',
    }
  });
}

/**
 * Waits for Telegram widget script to load, then creates widget
 */
export async function createTelegramWidgetAsync(
  container: HTMLElement,
  config: TelegramWidgetConfig
): Promise<void> {
  // Wait for script to load
  const checkScript = setInterval(() => {
    if (document.querySelector('script[src*="telegram-widget.js"]')) {
      clearInterval(checkScript);
      createTelegramWidget(container, config);
    }
  }, 100);

  // Cleanup after 5 seconds
  setTimeout(() => {
    clearInterval(checkScript);
    if (!container.querySelector('iframe') && !container.querySelector('a')) {
      config.onError?.(new Error('Widget script did not load'));
    }
  }, 5000);
}

