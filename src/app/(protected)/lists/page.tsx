import { ListsDirectory } from "@/features/lists/lists-directory";
import { loadLists } from "@/features/lists/data";

export default async function ListsPage() {
  return <ListsDirectory lists={await loadLists()} />;
}
