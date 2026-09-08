import type { Account, AccountType } from "../../api/account-api";

export type AccountSelectScope = AccountType | "all";

const GROUP_LABELS: Record<AccountType, string> = {
  debt: "Debts",
  investment: "Investments",
};

export function accountSelectGroup(type: AccountType): string {
  return GROUP_LABELS[type];
}

export function accountsForSelect(
  accounts: readonly Account[],
  scope: AccountSelectScope,
): Account[] {
  return accounts
    .filter(
      (account) =>
        account.active !== false &&
        (scope === "all" || account.type === scope),
    )
    .sort((left, right) => {
      const groupOrder = accountSelectGroup(left.type).localeCompare(
        accountSelectGroup(right.type),
        "en-US",
        { sensitivity: "base" },
      );
      return (
        groupOrder ||
        left.name.localeCompare(right.name, "en-US", {
          numeric: true,
          sensitivity: "base",
        })
      );
    });
}
