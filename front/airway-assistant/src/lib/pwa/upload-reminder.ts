export const UPLOAD_REMINDER_SYNC_TAG =
  "airway-upload-reminder-v1";

export const UPLOAD_REMINDER_NOTIFICATION_TAG =
  "airway-upload-reminder";


interface SyncManagerLike {
  register: (
    tag:
      string,
  ) =>
    Promise<void>;

  getTags?: () =>
    Promise<string[]>;
}


type ServiceWorkerRegistrationWithSync =
  ServiceWorkerRegistration & {
    sync?:
      SyncManagerLike;
  };


function hasBrowserEnvironment() {
  return (
    typeof window !==
      "undefined" &&
    typeof navigator !==
      "undefined"
  );
}



export function notificationsAvailable() {
  if (
    !hasBrowserEnvironment()
  ) {
    return false;
  }

  return (
    window.isSecureContext &&
    "Notification" in
      window &&
    "serviceWorker" in
      navigator
  );
}


export function getNotificationPermission():
  | NotificationPermission
  | "unsupported" {
  if (
    !notificationsAvailable()
  ) {
    return "unsupported";
  }

  return Notification.permission;
}



export async function requestNotificationPermission():
  Promise<
    | NotificationPermission
    | "unsupported"
  > {
  if (
    !notificationsAvailable()
  ) {
    return "unsupported";
  }

  try {
    return await Notification
      .requestPermission();
  } catch (
    error
  ) {
    console.warn(
      "Unable to request notification permission:",
      error,
    );

    return "denied";
  }
}




export const requestUploadReminderPermission =
  requestNotificationPermission;



  
export async function getReadyServiceWorkerRegistration():
  Promise<
    ServiceWorkerRegistration | null
  > {
  if (
    !hasBrowserEnvironment() ||
    !(
      "serviceWorker" in
      navigator
    )
  ) {
    return null;
  }

  try {
    return await navigator
      .serviceWorker
      .ready;
  } catch (
    error
  ) {
    console.warn(
      "Service worker is not ready:",
      error,
    );

    return null;
  }
}




export async function backgroundSyncAvailable() {
  const registration =
    await getReadyServiceWorkerRegistration();

  if (
    !registration
  ) {
    return false;
  }

  const registrationWithSync =
    registration as
      ServiceWorkerRegistrationWithSync;

  return Boolean(
    registrationWithSync.sync &&
    typeof registrationWithSync
      .sync
      .register ===
      "function",
  );
}


export async function registerUploadReminderSync() {
  const registration =
    await getReadyServiceWorkerRegistration();

  if (
    !registration
  ) {
    return false;
  }

  const registrationWithSync =
    registration as
      ServiceWorkerRegistrationWithSync;

  if (
    !registrationWithSync.sync ||
    typeof registrationWithSync
      .sync
      .register !==
      "function"
  ) {

    
    return false;
  }

  try {

    
    if (
      typeof registrationWithSync
        .sync
        .getTags ===
      "function"
    ) {
      const tags =
        await registrationWithSync
          .sync
          .getTags();

      if (
        tags.includes(
          UPLOAD_REMINDER_SYNC_TAG,
        )
      ) {
        return true;
      }
    }

    await registrationWithSync
      .sync
      .register(
        UPLOAD_REMINDER_SYNC_TAG,
      );

    return true;
  } catch (
    error
  ) {
    console.warn(
      "Unable to register upload reminder sync:",
      error,
    );

    return false;
  }
}




export async function showLocalTestNotification() {
  if (
    !notificationsAvailable()
  ) {
    return false;
  }

  if (
    Notification.permission !==
    "granted"
  ) {
    return false;
  }

  const registration =
    await getReadyServiceWorkerRegistration();

  if (
    !registration
  ) {
    return false;
  }

  try {
    await registration
      .showNotification(
        "یادآوری فعال شد",
        {
          body:
            "از این پس می‌توانید یادآوری‌های مربوط به ارسال را دریافت کنید.",

          tag:
            "airway-notification-enabled",

          data: {
            url:
              "/queue",
          },
        },
      );

    return true;
  } catch (
    error
  ) {
    console.warn(
      "Unable to show test notification:",
      error,
    );

    return false;
  }
}