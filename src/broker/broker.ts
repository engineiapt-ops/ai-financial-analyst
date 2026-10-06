export type BrokerEnvironment = "sim" | "live";

export interface BrokerAccountSummary {
  accountKey: string;
  accountId: string;
  currency: string;
  accountType: string;
  active: boolean;
}

export interface BrokerReadClient {
  readonly id: string;
  readonly environment: BrokerEnvironment;
  readonly executionEnabled: false;

  getAccounts(): Promise<BrokerAccountSummary[]>;
  getAccount(accountKey: string): Promise<BrokerAccountSummary>;
}
