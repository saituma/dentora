"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  isLoading?: boolean;
  enableRowSelection?: boolean;
  onRowSelectionChange?: (rows: TData[]) => void;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  total = 0,
  page = 0,
  pageSize = 20,
  onPageChange,
  isLoading = false,
  enableRowSelection = false,
  onRowSelectionChange,
  emptyMessage = "No results.",
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const tableColumns: ColumnDef<TData, TValue>[] = enableRowSelection
    ? [
        {
          id: "select",
          header: ({ table }) => (
            <Checkbox
              checked={table.getIsAllPageRowsSelected()}
              indeterminate={
                !table.getIsAllPageRowsSelected() &&
                table.getIsSomePageRowsSelected()
              }
              onCheckedChange={(value) =>
                table.toggleAllPageRowsSelected(!!value)
              }
              aria-label="Select all"
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Select row"
              onClick={(e) => e.stopPropagation()}
            />
          ),
          enableSorting: false,
          enableHiding: false,
          size: 40,
        },
        ...columns,
      ]
    : columns;

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    enableRowSelection,
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(next);
      if (onRowSelectionChange) {
        const selectedRows = Object.keys(next)
          .filter((k) => next[k])
          .map((k) => data[Number(k)])
          .filter(Boolean);
        onRowSelectionChange(selectedRows);
      }
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const pageCount = Math.ceil(total / pageSize);
  const start = total === 0 ? 0 : page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-end gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs text-zinc-500"
              />
            }
          >
            <Settings2 size={12} />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="capitalize text-xs"
                  checked={col.getIsVisible()}
                  onCheckedChange={(val) => col.toggleVisibility(!!val)}
                >
                  {col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800/60 overflow-hidden">
        <Table>
          <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
            {table.getHeaderGroups().map((hg) => (
              <TableRow
                key={hg.id}
                className="border-zinc-200 dark:border-zinc-800/60 hover:bg-transparent"
              >
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.column.getSize() }}
                      className={cn(
                        "text-xs font-medium text-zinc-500 dark:text-zinc-400 py-2.5",
                        canSort && "cursor-pointer select-none",
                      )}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-1">
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {canSort && (
                            <span className="text-zinc-400">
                              {sorted === "asc" ? (
                                <ChevronUp size={12} />
                              ) : sorted === "desc" ? (
                                <ChevronDown size={12} />
                              ) : (
                                <ChevronsUpDown size={12} />
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow
                  key={`sk-${i}`}
                  className="border-zinc-100 dark:border-zinc-800/50"
                >
                  {tableColumns.map((_, ci) => (
                    <TableCell key={`sk-${i}-${ci}`}>
                      <Skeleton className="h-4 w-full rounded" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={tableColumns.length}
                  className="h-32 text-center text-sm text-zinc-500"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className="border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3 text-sm">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {onPageChange && total > pageSize && (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            {total === 0
              ? "No results"
              : `${start}–${end} of ${total.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft size={13} />
            </Button>
            <span className="px-2 font-medium text-zinc-700 dark:text-zinc-300">
              {page + 1} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => onPageChange(page + 1)}
              disabled={page + 1 >= pageCount}
            >
              <ChevronRight size={13} />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
