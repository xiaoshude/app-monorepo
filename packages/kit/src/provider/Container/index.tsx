import { useEffect, useMemo, useState } from 'react';

import { RootSiblingParent } from 'react-native-root-siblings';

import { Page, Toast } from '@onekeyhq/components';
import type { IAppEventBusPayload } from '@onekeyhq/shared/src/eventBus/appEventBus';
import {
  EAppEventBusNames,
  appEventBus,
} from '@onekeyhq/shared/src/eventBus/appEventBus';
import platformEnv from '@onekeyhq/shared/src/platformEnv';

import { WalletConnectModalContainer } from '../../components/WalletConnect/WalletConnectModalContainer';
import { JotaiContextRootProvidersAutoMount } from '../../states/jotai/utils/JotaiContextStoreMirrorTracker';

import { AppStateLockContainer } from './AppStateLockContainer';
import { CloudBackupContainer } from './CloudBackupContainer';
import { FullWindowOverlayContainer } from './FullWindowOverlayContainer';
import { HardwareUiStateContainer } from './HardwareUiStateContainer';
import { KeyboardContainer } from './KeyboardContainer';
import { NavigationContainer } from './NavigationContainer';
import { PortalBodyContainer } from './PortalBodyContainer';

function ErrorToastContainer() {
  useEffect(() => {
    const fn = (p: IAppEventBusPayload[EAppEventBusNames.ShowToast]) => {
      Toast[p.method](p);
    };
    appEventBus.on(EAppEventBusNames.ShowToast, fn);
    return () => {
      appEventBus.off(EAppEventBusNames.ShowToast, fn);
    };
  }, []);

  return null;
}

function FlipperPluginsContainer() {
  console.log('FlipperPluginsContainer render');
  const [realmReady, setRealmReady] = useState(false);
  useEffect(() => {
    const fn = () => {
      console.log('FlipperPluginsContainer realm ready');
      setRealmReady(true);
    };
    if (global.$$realm) {
      fn();
    }
    appEventBus.on(EAppEventBusNames.RealmInit, fn);
    return () => {
      appEventBus.off(EAppEventBusNames.RealmInit, fn);
    };
  }, []);
  const realmPlugin = useMemo(() => {
    if (process.env.NODE_ENV !== 'production') {
      if (realmReady && global.$$realm && platformEnv.isNative) {
        console.log('FlipperPluginsContainer render realm plugin');
        const RealmFlipperPlugin = (
          require('@onekeyhq/shared/src/modules3rdParty/realm-flipper-plugin-device') as typeof import('@onekeyhq/shared/src/modules3rdParty/realm-flipper-plugin-device')
        ).default;
        return <RealmFlipperPlugin realms={[global.$$realm]} />;
      }
    }
    return null;
  }, [realmReady]);
  return <>{realmPlugin}</>;
}

const renderWalletConnectModalContainer = platformEnv.isNativeIOS ? (
  <Page.Every>
    <WalletConnectModalContainer />
  </Page.Every>
) : (
  <WalletConnectModalContainer />
);

export function Container() {
  return (
    <RootSiblingParent>
      <AppStateLockContainer>
        <KeyboardContainer />
        <NavigationContainer>
          <JotaiContextRootProvidersAutoMount />
          <HardwareUiStateContainer />
          <CloudBackupContainer />
          <FullWindowOverlayContainer />
          <PortalBodyContainer />
          <ErrorToastContainer />
          {process.env.NODE_ENV !== 'production' ? (
            <>
              <FlipperPluginsContainer />
            </>
          ) : null}
        </NavigationContainer>
        {renderWalletConnectModalContainer}
      </AppStateLockContainer>
    </RootSiblingParent>
  );
}
