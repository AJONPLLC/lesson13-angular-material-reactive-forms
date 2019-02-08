import { CollectionViewer, SelectionChange } from '@angular/cdk/collections';
import { FlatTreeControl } from '@angular/cdk/tree';
import { Component, Injectable, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, merge, Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { Book } from 'src/app/core/models/book';
import { Chapter } from 'src/app/core/models/chapter';
import { Section } from 'src/app/core/models/section';
import { FirestoreService } from 'src/app/core/services/firestore.service';

/** Flat node with expandable and level information */
export class DynamicFlatNode {
  constructor(
    public item: string,
    public level = 1,
    public expandable = false,
    public isLoading = false,
    public book?: Book,
    public chapter?: Chapter,
    public section?: Section
  ) {}
}

@Injectable()
export class DynamicDataSource {
  get data(): DynamicFlatNode[] {
    return this.dataChange.value;
  }
  set data(value: DynamicFlatNode[]) {
    this.treeControl.dataNodes = value;
    this.dataChange.next(value);
  }

  constructor(
    private treeControl: FlatTreeControl<DynamicFlatNode>,
    private route: ActivatedRoute,
    private fs: FirestoreService,
    private router: Router
  ) {
    /** Initial data from database */
    // this.subscriptions.push(
    //   this.route.queryParams.subscribe(params => {
    //     console.log(params);
    //   })
    // );
    this.subscriptions.push(
      this.route.paramMap.subscribe(paramMap => {
        const bookId = paramMap.get('bookId');
        this.fs.getBookChapters(bookId).subscribe(chapters => {
          const nodes: DynamicFlatNode[] = [];
          chapters.sort((a, b) => (a.sort < b.sort ? -1 : 1));
          chapters.forEach(chapter =>
            nodes.push(
              new DynamicFlatNode(
                chapter.title,
                0,
                true,
                false,
                { id: bookId },
                chapter
              )
            )
          );
          this.data = nodes;
        });
      })
    );
  }
  bookTree = {};
  dataChange = new BehaviorSubject<DynamicFlatNode[]>([]);
  subscriptions: Subscription[] = [];

  connect(collectionViewer: CollectionViewer): Observable<DynamicFlatNode[]> {
    this.treeControl.expansionModel.onChange.subscribe(change => {
      if (
        (change as SelectionChange<DynamicFlatNode>).added ||
        (change as SelectionChange<DynamicFlatNode>).removed
      ) {
        this.handleTreeControl(change as SelectionChange<DynamicFlatNode>);
      }
    });

    return merge(collectionViewer.viewChange, this.dataChange).pipe(
      map(() => this.data)
    );
  }

  /** Handle expand/collapse behaviors */
  handleTreeControl(change: SelectionChange<DynamicFlatNode>) {
    if (change.added) {
      change.added.forEach(node => this.toggleNode(node, true));
    }
    if (change.removed) {
      change.removed
        .slice()
        .reverse()
        .forEach(node => this.toggleNode(node, false));
    }
  }

  /**
   * Toggle the node, remove from display list
   */
  toggleNode(node: DynamicFlatNode, expand: boolean) {
    const index = this.data.indexOf(node);
    node.isLoading = true;
    if (expand) {
      this.subscriptions.push(
        this.fs
          .getBookSections(node.book.id, node.chapter.id)
          .subscribe(async sections => {
            console.log(sections);
            const nodes: DynamicFlatNode[] = [];
            sections.sort((a, b) => (a.sort < b.sort ? -1 : 1));
            sections.forEach(section =>
              nodes.push(
                new DynamicFlatNode(
                  section.title,
                  1,
                  false,
                  false,
                  node.book,
                  node.chapter,
                  section
                )
              )
            );
            this.data.splice(index + 1, 0, ...nodes);
            this.dataChange.next(this.data);

            // Update query params on current chapter
            await this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { chapterId: node.chapter.id },
              queryParamsHandling: 'merge'
            });
            // Remove any left over section params
            await this.router.navigate([], {
              relativeTo: this.route,
              queryParams: { sectionId: '' },
              queryParamsHandling: 'merge'
            });

            node.isLoading = false;
          })
      );
    } else {
      let count = 0;
      for (
        let i = index + 1;
        i < this.data.length && this.data[i].level > node.level;
        i++, count++
      ) {}
      this.data.splice(index + 1, count);
      // notify the change
      this.dataChange.next(this.data);
      node.isLoading = false;
    }
  }
}

@Component({
  selector: 'app-book-tree',
  templateUrl: './book-tree.component.html',
  styleUrls: ['./book-tree.component.scss']
})
export class BookTreeComponent implements OnInit, OnDestroy {
  constructor(
    private route: ActivatedRoute,
    private fs: FirestoreService,
    private router: Router
  ) {
    this.treeControl = new FlatTreeControl<DynamicFlatNode>(
      this.getLevel,
      this.isExpandable
    );
    this.dataSource = new DynamicDataSource(
      this.treeControl,
      this.route,
      this.fs,
      this.router
    );
  }
  dataSource: DynamicDataSource;
  treeControl: FlatTreeControl<DynamicFlatNode>;

  getLevel = (node: DynamicFlatNode) => node.level;

  hasChild = (_: number, _nodeData: DynamicFlatNode) => _nodeData.expandable;

  isExpandable = (node: DynamicFlatNode) => node.expandable;

  ngOnDestroy() {
    this.dataSource.subscriptions.forEach(s => {
      s.unsubscribe();
    });
  }

  ngOnInit() {}

  section(node: DynamicFlatNode) {
    // Update query params on current chapter
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sectionId: node.section.id },
      queryParamsHandling: 'merge'
    });
  }
}
