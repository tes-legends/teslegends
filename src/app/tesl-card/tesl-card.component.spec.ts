import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeslCardComponent } from './tesl-card.component';

describe('TeslCardComponent', () => {
  let component: TeslCardComponent;
  let fixture: ComponentFixture<TeslCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TeslCardComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeslCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
